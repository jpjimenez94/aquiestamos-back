import { prisma } from '../config/database.js'
import { PatientModel } from '../models/patient.model.js'
import { TriageResponseModel } from '../models/triageResponse.model.js'
import {
  admitirSolicitud,
  prioridadPorSilencio,
  DIAS_SIN_RESPUESTA,
} from '../services/promotion.service.js'
import { pacienteAdmitido } from '../notifications/eventos.js'
import { registrar, ACCION } from '../services/audit.service.js'

/**
 * El que recoge a quien nunca respondió.
 *
 * Desde que la admisión la dispara el tamizaje, entrar a la cola depende de
 * que la persona abra un enlace y conteste siete preguntas. Casi todo el mundo
 * lo hace, pero quien está peor es justamente quien menos probable es que lo
 * haga: no tiene batería, no tiene datos, no tiene cabeza para un formulario.
 *
 * Sin esto, esas solicitudes se quedan para siempre en la bandeja con la
 * etiqueta «Sin responder» y nadie las admite nunca. Alguien pidió ayuda y el
 * sistema no la puso en ninguna cola. Es el peor fallo posible aquí, y además
 * uno silencioso: no hay error en pantalla, simplemente no pasa nada.
 *
 * Corre dentro del proceso de Express y no como cron a propósito. Un cron que
 * alguien tiene que acordarse de configurar en Railway es exactamente la clase
 * de cosa que no se configura, y el día que no esté nadie se entera.
 */

/** Cada cuánto se mira. No hace falta más: el umbral se mide en días. */
const CADA_MS = 60 * 60 * 1000

/** Tope por tanda, para que la primera ejecución no admita 200 de golpe. */
const POR_TANDA = 50

let temporizador = null
let corriendo = false

export function arrancarBarrido() {
  if (temporizador) return

  // Una pasada al arrancar: si el servidor estuvo caído el fin de semana, lo
  // pendiente se recoge ya y no dentro de una hora.
  barrer().catch((error) => console.error('[admisión] primera tanda fallida:', error.message))

  temporizador = setInterval(() => {
    barrer().catch((error) => console.error('[admisión] tanda fallida:', error.message))
  }, CADA_MS)

  temporizador.unref?.()

  console.log(
    `[admisión] rescate automático activo: lo que lleve ${DIAS_SIN_RESPUESTA} días sin responder ` +
      'el tamizaje se admite solo.',
  )
}

export function detenerBarrido() {
  if (!temporizador) return
  clearInterval(temporizador)
  temporizador = null
}

/**
 * Admite lo que lleva demasiado tiempo sin respuesta.
 * Se exporta para poder llamarlo a mano desde un script o desde las pruebas.
 */
export async function barrer({ dias = DIAS_SIN_RESPUESTA } = {}) {
  if (corriendo) return { admitidas: 0, fallidas: 0, revisadas: 0 }
  corriendo = true

  const resumen = { admitidas: 0, fallidas: 0, revisadas: 0 }

  try {
    const corte = new Date(Date.now() - dias * 86400000)

    const candidatas = await prisma.supportRequest.findMany({
      where: { deletedAt: null, status: 'NUEVO', createdAt: { lt: corte } },
      orderBy: { createdAt: 'asc' },
      take: POR_TANDA,
    })

    resumen.revisadas = candidatas.length

    for (const solicitud of candidatas) {
      try {
        // `status: NUEVO` es la señal de que no se admitió, pero la que manda
        // es que no exista ya la ficha: si alguna vez las dos se separan, se
        // duplicaría una persona.
        const yaTiene = await PatientModel.findBySupportRequestId(solicitud.id)
        if (yaTiene) continue

        /**
         * Puede haber respondido y haber fallado la admisión de ese momento
         * —el tamizaje se guarda aparte justamente para que eso no pierda la
         * respuesta—. En ese caso vale su prioridad calculada, no MEDIA: sería
         * absurdo ignorar lo que la persona sí nos contó.
         */
        const respondido = await TriageResponseModel.ultimaDe(solicitud.id)
        const prioridad = respondido
          ? respondido.suggestedPriority
          : prioridadPorSilencio(solicitud)

        const paciente = await admitirSolicitud({
          supportRequestId: solicitud.id,
          ajustes: { priority: prioridad },
        })

        await pacienteAdmitido(paciente, { sinRespuesta: !respondido })

        // No hay actor: esto lo hizo el sistema. El rastro tiene que decir por
        // qué, porque una prioridad que nadie eligió necesita explicarse.
        await registrar({
          req: null,
          action: ACCION.CREAR,
          entity: 'paciente',
          entityId: paciente.id,
          after: {
            desdeSolicitud: solicitud.id,
            prioridad,
            motivo: respondido
              ? 'rescate: respondió el tamizaje pero no se había admitido'
              : `rescate: ${dias} días sin responder el tamizaje`,
          },
        })

        resumen.admitidas += 1
      } catch (error) {
        resumen.fallidas += 1
        console.error(
          `[admisión] no se pudo rescatar la solicitud ${solicitud.id}:`,
          error.message,
        )
      }
    }

    if (resumen.admitidas > 0) {
      console.log(`[admisión] rescatadas ${resumen.admitidas} solicitudes sin respuesta.`)
    }

    return resumen
  } finally {
    corriendo = false
  }
}
