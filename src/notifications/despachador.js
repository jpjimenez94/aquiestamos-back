import { contenidoDelPortal } from './plantillaEditable.js'
import { conCerrojo, CERROJOS } from '../config/cerrojo.js'
import { NotificationModel } from '../models/notification.model.js'
import { enviarCorreo, hayCorreoConfigurado, transporteEnUso } from './mailer.js'
import { construir } from './plantillas.js'
import { env } from '../config/env.js'

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

  // El cerrojo se pide aquí y no dentro de `despachar`: `npm run
  // avisos:despachar` y las pruebas la siguen llamando directamente.
  //
  // Es el trabajo donde duplicar duele más: un correo enviado no se puede
  // recoger. La bandera `corriendo` de dentro protege de que una tanda se
  // monte sobre la anterior en ESTE proceso; esto protege de que dos procesos
  // manden el mismo aviso a la misma persona.
  temporizador = setInterval(() => {
    conCerrojo(CERROJOS.AVISOS, despachar).catch((error) =>
      console.error('[avisos] tanda fallida:', error.message),
    )
  }, CADA_MS)

  // No debe mantener vivo el proceso: si Node no tiene nada más que hacer,
  // que se cierre.
  temporizador.unref?.()

  if (hayCorreoConfigurado()) {
    console.log(`[avisos] despachador activo cada ${CADA_MS / 1000}s · ${transporteEnUso()}`)
  }

  // Los correos llevan el logo y los botones apuntando a SITIO_URL. Si apunta
  // a la máquina de desarrollo, quien reciba el correo ve una imagen rota y un
  // enlace que no abre. Pasó en producción y no había forma de notarlo hasta
  // que alguien miró un correo recibido.
  if (/localhost|127\.0\.0\.1/.test(env.sitioUrl)) {
    console.warn(
      `[avisos] OJO: SITIO_URL es "${env.sitioUrl}". Los correos van a salir con ` +
        'el logo roto y enlaces que no abren. En producción tiene que ser el dominio real.',
    )
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
        // Lo que la coordinación escribió en Parametrización, si escribió algo.
        // Devuelve null ante cualquier duda —sin plantilla, JSON roto, base
        // caída— y entonces sale el texto del código: nadie se queda sin correo
        // porque una pantalla de configuración no respondiera.
        const editado = await contenidoDelPortal(aviso.template, aviso.payload ?? {})
        const { asunto, html, texto } = construir(aviso.template, aviso.payload, editado)

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
