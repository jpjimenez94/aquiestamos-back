import { prisma } from '../config/database.js'
import { cancelarAsignacion } from '../services/appointment.service.js'
import { asignacionVencida } from '../notifications/eventos.js'
import { registrar, ACCION } from '../services/audit.service.js'

/**
 * El que libera lo que se quedó esperando una respuesta que no llega.
 *
 * La asignación es una negociación a tres bandas y puede morirse de silencio
 * en dos tramos: el profesional que nunca abre su enlace, y la persona que
 * nunca confirma el horario. En los dos casos el resultado sin esto es el
 * mismo y es el malo: el caso ni avanza ni vuelve a la cola, el cupo del
 * profesional sigue ocupado por alguien a quien no está acompañando, y una
 * persona que pidió ayuda espera a que alguien se dé cuenta mirando el
 * tablero.
 *
 * Al vencer, la asignación se cancela con el mismo camino que usa quien
 * coordina a mano —cancelarAsignacion—, así que todo lo que cuelga de los
 * estados vivos se libera solo: el cupo del profesional, el candado de una
 * negociación por persona y el enlace del caso. La persona vuelve a
 * EN_ADMISION y reaparece en «Por asignar» para proponérsela a otro.
 *
 * Corre dentro del proceso de Express, como el barrido de admisión y por la
 * misma razón: un cron que alguien tiene que acordarse de configurar es
 * exactamente la clase de cosa que no se configura.
 */

/** Días que se espera al profesional antes de proponer el caso a otro. */
export const PROPUESTA_VENCE_DIAS = Number(process.env.PROPUESTA_VENCE_DIAS ?? 2)

/**
 * Días que se espera la confirmación de horario de la persona. Es más largo
 * que el del profesional a propósito: quien pide ayuda puede estar sin
 * batería, sin datos o sin cabeza, y soltarle el acompañamiento demasiado
 * rápido castiga justo a quien peor está.
 */
export const ACEPTADA_VENCE_DIAS = Number(process.env.ACEPTADA_VENCE_DIAS ?? 3)

/** Cada cuánto se mira. Los umbrales se miden en días; con una hora sobra. */
const CADA_MS = 60 * 60 * 1000

/** Tope por tanda, para que una primera ejecución no cancele 200 de golpe. */
const POR_TANDA = 50

let temporizador = null
let corriendo = false

export function arrancarBarridoAsignaciones() {
  if (temporizador) return

  // Una pasada al arrancar: si el servidor estuvo caído, lo vencido se
  // libera ya y no dentro de una hora.
  barrerAsignaciones().catch((error) =>
    console.error('[asignaciones] primera tanda fallida:', error.message),
  )

  temporizador = setInterval(() => {
    barrerAsignaciones().catch((error) =>
      console.error('[asignaciones] tanda fallida:', error.message),
    )
  }, CADA_MS)

  temporizador.unref?.()

  console.log(
    `[asignaciones] liberación automática activa: propuesta sin respuesta ${PROPUESTA_VENCE_DIAS}d, ` +
      `horario sin confirmar ${ACEPTADA_VENCE_DIAS}d.`,
  )
}

export function detenerBarridoAsignaciones() {
  if (!temporizador) return
  clearInterval(temporizador)
  temporizador = null
}

/**
 * Cancela lo vencido y avisa. Se exporta para poder llamarlo a mano desde un
 * script o desde las pruebas, sin esperar al reloj.
 */
export async function barrerAsignaciones({
  diasPropuesta = PROPUESTA_VENCE_DIAS,
  diasAceptada = ACEPTADA_VENCE_DIAS,
} = {}) {
  if (corriendo) return { liberadas: 0, fallidas: 0, revisadas: 0 }
  corriendo = true

  const resumen = { liberadas: 0, fallidas: 0, revisadas: 0 }

  try {
    const ahora = Date.now()

    const vencidas = await prisma.caseAssignment.findMany({
      where: {
        deletedAt: null,
        OR: [
          // El profesional nunca respondió a la propuesta.
          { status: 'PROPUESTA', startedAt: { lt: new Date(ahora - diasPropuesta * 86400000) } },
          // Aceptó, pero la persona nunca confirmó un horario. El reloj corre
          // desde que él respondió, no desde que se propuso.
          { status: 'ACEPTADA', respondedAt: { lt: new Date(ahora - diasAceptada * 86400000) } },
        ],
      },
      include: { professional: { select: { id: true, fullName: true } } },
      orderBy: { startedAt: 'asc' },
      take: POR_TANDA,
    })

    resumen.revisadas = vencidas.length

    for (const asignacion of vencidas) {
      const tramo = asignacion.status === 'PROPUESTA' ? 'profesional' : 'persona'
      const motivo =
        tramo === 'profesional'
          ? `Liberada: el profesional no respondió en ${diasPropuesta} días`
          : `Liberada: la persona no confirmó horario en ${diasAceptada} días`

      try {
        await cancelarAsignacion({ asignacionId: asignacion.id, motivo })

        await asignacionVencida({ asignacion, profesional: asignacion.professional, tramo })

        // No hay actor: esto lo hizo el sistema, y el rastro tiene que decir
        // por qué se le quitó un caso a alguien sin que nadie lo pidiera.
        await registrar({
          req: null,
          action: ACCION.EDITAR,
          entity: 'asignacion',
          entityId: asignacion.id,
          before: { estado: asignacion.status },
          after: { estado: 'CANCELADA', motivo },
        })

        resumen.liberadas += 1
      } catch (error) {
        resumen.fallidas += 1
        console.error(`[asignaciones] no se pudo liberar ${asignacion.id}:`, error.message)
      }
    }

    if (resumen.liberadas > 0) {
      console.log(`[asignaciones] liberadas ${resumen.liberadas} asignaciones vencidas.`)
    }

    return resumen
  } finally {
    corriendo = false
  }
}
