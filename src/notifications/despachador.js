import { NotificationModel } from '../models/notification.model.js'
import { enviarCorreo, hayCorreoConfigurado, transporteEnUso } from './mailer.js'
import { construir } from './plantillas.js'

/**
 * El que vacía la bandeja de salida.
 *
 * Corre cada 30 segundos dentro del mismo proceso de Express. Para el volumen
 * de la red —decenas de correos al día, no miles— montar una cola aparte
 * sería infraestructura que hay que mantener sin ganar nada.
 *
 * Lo importante es que va SEPARADO de la petición: si el proveedor tarda o
 * está caído, el formulario público ya respondió hace rato.
 */

/**
 * Espera entre reintentos, en minutos. Crece porque casi todos los fallos son
 * temporales —un límite de envío, un corte de red— y reintentar de inmediato
 * solo consume cuota. A la quinta se da por perdido y queda el error escrito.
 */
const ESPERAS = [1, 5, 15, 60, 360]

const CADA_MS = 30_000
const POR_TANDA = 20

let temporizador = null
let corriendo = false
let yaAvisadoSinSmtp = false

export function arrancarDespachador() {
  if (temporizador) return

  // El temporizador arranca SIEMPRE, aunque no haya SMTP. La comprobación se
  // hace en cada tanda, no aquí: decidirlo una sola vez al arrancar deja al
  // despachador muerto en silencio si las credenciales se configuran después,
  // y nadie se entera hasta que alguien pregunta por qué no llegan los avisos.
  if (!hayCorreoConfigurado()) {
    console.log(
      '[avisos] SMTP sin configurar: los avisos se encolan pero no se envían. ' +
        'En cuanto se llenen SMTP_HOST, SMTP_USER y SMTP_PASSWORD y se reinicie, salen solos.',
    )
  }

  temporizador = setInterval(() => {
    despachar().catch((error) => console.error('[avisos] tanda fallida:', error.message))
  }, CADA_MS)

  // No debe mantener vivo el proceso: si Node no tiene nada más que hacer,
  // que se cierre.
  temporizador.unref?.()

  if (hayCorreoConfigurado()) {
    console.log(`[avisos] despachador activo cada ${CADA_MS / 1000}s · ${transporteEnUso()}`)
  }
}

export function detenerDespachador() {
  if (!temporizador) return
  clearInterval(temporizador)
  temporizador = null
}

/**
 * Envía una tanda. Se exporta para poder llamarlo a mano desde un script o
 * desde las pruebas, sin esperar al reloj.
 */
export async function despachar() {
  // Si una tanda se alarga, la siguiente no se le monta encima.
  if (corriendo) return { enviados: 0, fallidos: 0, omitidos: 0 }

  // Sin credenciales no se intenta: se dejarían todos los avisos con un
  // intento gastado y una espera por delante, por nada.
  if (!hayCorreoConfigurado()) {
    avisarUnaVezSinSmtp()
    return { enviados: 0, fallidos: 0, omitidos: 0 }
  }

  corriendo = true

  let enviados = 0
  let fallidos = 0

  try {
    const avisos = await NotificationModel.pendientes(POR_TANDA)

    for (const aviso of avisos) {
      try {
        const { asunto, html, texto } = construir(aviso.template, aviso.payload)

        await enviarCorreo({
          para: aviso.toEmail,
          nombre: aviso.toName,
          // El asunto se guardó al encolar; la plantilla manda si difieren,
          // porque puede haber cambiado el texto desde entonces.
          asunto: asunto ?? aviso.subject,
          html,
          texto,
        })

        await NotificationModel.marcarEnviado(aviso.id)
        enviados += 1
      } catch (error) {
        fallidos += 1
        const intentos = aviso.attempts + 1
        const espera = ESPERAS[intentos - 1]

        await NotificationModel.marcarFallo(
          aviso.id,
          intentos,
          error.message,
          espera ? new Date(Date.now() + espera * 60_000) : null,
        )

        if (!espera) {
          console.error(
            `[avisos] se da por perdido ${aviso.template} → ${aviso.toEmail}: ${error.message}`,
          )
        }
      }
    }

    return { enviados, fallidos, omitidos: 0 }
  } finally {
    corriendo = false
  }
}

/** Que el log no se llene con el mismo aviso cada 30 segundos. */
function avisarUnaVezSinSmtp() {
  if (yaAvisadoSinSmtp) return
  yaAvisadoSinSmtp = true
  console.warn('[avisos] hay avisos encolados pero SMTP no está configurado.')
}
