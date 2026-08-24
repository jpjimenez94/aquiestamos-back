import { prisma } from '../config/database.js'
import { NotificationModel } from '../models/notification.model.js'
import { construir } from '../notifications/plantillas.js'
import { avisoSlaAlta } from '../notifications/eventos.js'

/**
 * El barrido de las citas: los dos correos que nadie tiene que acordarse de
 * mandar, y la alarma del caso urgente que se está quedando en la cola.
 *
 *   1. RECORDATORIO — horas antes de la sesión, al profesional siempre y a la
 *      persona si dejó correo. La causa #1 de «no asistió» es el olvido.
 *   2. PEDIR EL REPORTE — un rato después de la hora de la sesión, al
 *      profesional: «cuéntanos desde tu enlace». Sin esto, coordinación tiene
 *      que acordarse de escribirle a cada uno.
 *   3. SLA DE PRIORIDAD ALTA — una persona admitida como ALTA que lleva días
 *      sin profesional no puede depender de que alguien mire el tablero:
 *      coordinación recibe el aviso.
 *
 * Cada correo se encola con una dedupeKey por cita y destino: el barrido corre
 * cada hora y repite las consultas, pero el aviso sale UNA vez.
 *
 * Corre dentro del proceso de Express, como los otros barridos y por la misma
 * razón: un cron que alguien tiene que acordarse de configurar es exactamente
 * la clase de cosa que no se configura.
 */

/** Cuántas horas antes de la sesión sale el recordatorio. */
export const RECORDATORIO_HORAS_ANTES = Number(process.env.RECORDATORIO_HORAS_ANTES ?? 10)

/** Cuántas horas después de la hora de la sesión se pide el reporte. */
export const PIDE_REPORTE_HORAS = Number(process.env.PIDE_REPORTE_HORAS ?? 2)

/** Días que puede esperar una prioridad ALTA sin profesional antes de alarmar. */
export const SLA_ALTA_DIAS = Number(process.env.SLA_ALTA_DIAS ?? 3)

const CADA_MS = 60 * 60 * 1000
const HORA_MS = 3600 * 1000

let temporizador = null
let corriendo = false

export function arrancarBarridoCitas() {
  if (temporizador) return

  barrerCitas().catch((error) => console.error('[citas] primera tanda fallida:', error.message))

  temporizador = setInterval(() => {
    barrerCitas().catch((error) => console.error('[citas] tanda fallida:', error.message))
  }, CADA_MS)

  temporizador.unref?.()

  console.log(
    `[citas] barrido activo: recordatorio ${RECORDATORIO_HORAS_ANTES}h antes, reporte ${PIDE_REPORTE_HORAS}h después, SLA alta ${SLA_ALTA_DIAS}d.`,
  )
}

export function detenerBarridoCitas() {
  if (!temporizador) return
  clearInterval(temporizador)
  temporizador = null
}

function pila(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] || null
}

/** Encola con plantilla resuelta; la dedupeKey garantiza que salga una vez. */
async function encolar({ plantilla, para, nombre, payload, entidad, entidadId, clave }) {
  if (!para) return false
  try {
    const { asunto } = construir(plantilla, payload)
    const creado = await NotificationModel.encolar({
      template: plantilla,
      toEmail: String(para).trim().toLowerCase(),
      toName: nombre ?? null,
      subject: asunto,
      payload,
      entity: entidad,
      entityId: String(entidadId),
      dedupeKey: clave,
    })
    return creado != null
  } catch (error) {
    console.error(`[citas] no se pudo encolar ${plantilla}:`, error.message)
    return false
  }
}

/** Se exporta para poder llamarlo a mano desde un script o desde las pruebas. */
export async function barrerCitas({
  horasAntes = RECORDATORIO_HORAS_ANTES,
  horasDespues = PIDE_REPORTE_HORAS,
  slaDias = SLA_ALTA_DIAS,
} = {}) {
  if (corriendo) return { recordatorios: 0, reportesPedidos: 0, slaAvisadas: 0 }
  corriendo = true

  const resumen = { recordatorios: 0, reportesPedidos: 0, slaAvisadas: 0 }
  const ahora = Date.now()

  try {
    // ---------- 1. Recordatorios: sesiones que empiezan pronto ----------
    const proximas = await prisma.appointment.findMany({
      where: {
        status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
        startsAt: { gt: new Date(ahora), lte: new Date(ahora + horasAntes * HORA_MS) },
      },
      include: {
        professional: { select: { id: true, fullName: true, email: true } },
        patient: { select: { id: true, fullName: true, email: true } },
      },
      take: 100,
    })

    for (const cita of proximas) {
      const cuando = cita.startsAt
      const comun = {
        cuando: cuando.toISOString(),
        modalidad: cita.modality,
        entidad: 'cita',
        entidadId: cita.id,
      }

      if (
        await encolar({
          plantilla: 'RECORDATORIO_CITA_PROFESIONAL',
          para: cita.professional?.email,
          nombre: cita.professional?.fullName,
          payload: {
            nombre: pila(cita.professional?.fullName),
            cuando: comun.cuando,
            modalidad: cita.modality,
            ruta: `/portal/caso/${cita.patientId}`,
          },
          entidad: 'cita',
          entidadId: cita.id,
          clave: `recordatorio-prof:${cita.id}`,
        })
      ) {
        resumen.recordatorios += 1
      }

      // A la persona solo si dejó correo; el WhatsApp sigue siendo manual.
      if (
        await encolar({
          plantilla: 'RECORDATORIO_CITA_PERSONA',
          para: cita.patient?.email,
          nombre: cita.patient?.fullName,
          payload: {
            nombre: pila(cita.patient?.fullName),
            profesional: pila(cita.professional?.fullName),
            cuando: comun.cuando,
            modalidad: cita.modality,
          },
          entidad: 'cita',
          entidadId: cita.id,
          clave: `recordatorio-pers:${cita.id}`,
        })
      ) {
        resumen.recordatorios += 1
      }
    }

    // ---------- 2. Pedir el reporte: sesiones que ya pasaron ----------
    const pasadas = await prisma.appointment.findMany({
      where: {
        status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
        endsAt: {
          lt: new Date(ahora - horasDespues * HORA_MS),
          // Ventana de 7 días hacia atrás: lo más viejo ya no es "recién pasó".
          gt: new Date(ahora - 7 * 24 * HORA_MS),
        },
      },
      include: { professional: { select: { id: true, fullName: true, email: true } } },
      take: 100,
    })

    for (const cita of pasadas) {
      if (
        await encolar({
          plantilla: 'PIDE_REPORTE',
          para: cita.professional?.email,
          nombre: cita.professional?.fullName,
          payload: {
            nombre: pila(cita.professional?.fullName),
            cuando: cita.startsAt.toISOString(),
            ruta: `/portal/caso/${cita.patientId}`,
          },
          entidad: 'cita',
          entidadId: cita.id,
          clave: `pide-reporte:${cita.id}`,
        })
      ) {
        resumen.reportesPedidos += 1
      }
    }

    // ---------- 3. SLA: prioridad ALTA con días en la cola ----------
    const estancadas = await prisma.patient.findMany({
      where: {
        deletedAt: null,
        priority: 'ALTA',
        status: { in: ['NUEVO', 'EN_ADMISION'] },
        createdAt: { lt: new Date(ahora - slaDias * 24 * HORA_MS) },
        assignments: { none: { status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA'] }, deletedAt: null } },
      },
      select: { id: true, city: true, createdAt: true },
      take: 50,
    })

    for (const persona of estancadas) {
      const dias = Math.floor((ahora - persona.createdAt.getTime()) / (24 * HORA_MS))
      const aviso = await avisoSlaAlta({ paciente: persona, dias })
      if (aviso) resumen.slaAvisadas += 1
    }

    const total = resumen.recordatorios + resumen.reportesPedidos + resumen.slaAvisadas
    if (total > 0) {
      console.log(
        `[citas] ${resumen.recordatorios} recordatorios, ${resumen.reportesPedidos} reportes pedidos, ${resumen.slaAvisadas} SLA avisadas.`,
      )
    }

    return resumen
  } finally {
    corriendo = false
  }
}
