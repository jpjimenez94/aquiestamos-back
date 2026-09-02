import { prisma } from '../config/database.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { registrar, ACCION } from '../services/audit.service.js'
import {
  huboSesion,
  reporteDeLaCita,
  REPORTE_NIEGA,
  ESTADOS,
} from '../services/appointmentState.service.js'

/**
 * Cierra solas las sesiones que ya tienen prueba de lo que pasó.
 *
 * «Marcar como realizada» era un clic humano en el portal: alguien tenía que
 * acordarse, por cada sesión, de entrar y pulsarlo. Nadie se acordaba —esta
 * semana había nueve sesiones pasadas sin cerrar— y mientras tanto el caso
 * seguía enseñando «ya hay cita», la persona no salía de la columna de citas
 * confirmadas y el informe contaba de menos.
 *
 * El sistema ya sabía si la sesión ocurrió: lo dice el reporte del
 * profesional, y si no lo hay, la telemetría de la sala. Es exactamente la
 * regla con la que el informe cuenta sesiones (`huboSesion`). Si el informe
 * la da por hecha, la cita puede darse por hecha; tener dos verdades —una
 * para contar y otra para el estado— es como se llega a un tablero que dice
 * una cosa y una ficha que dice otra.
 *
 * Solo toca citas cuya hora de fin ya pasó. Una sesión en curso no se cierra
 * aunque las dos personas estén dentro.
 */
export async function cerrarSesionesConPrueba({ patientId, ahora = Date.now() } = {}) {
  const abiertas = await prisma.appointment.findMany({
    where: {
      status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
      endsAt: { lt: new Date(ahora) },
      ...(patientId ? { patientId } : {}),
    },
    select: {
      id: true,
      status: true,
      startsAt: true,
      caseAssignmentId: true,
      patientFirstJoinedAt: true,
      professionalFirstJoinedAt: true,
    },
    take: 200,
  })
  if (abiertas.length === 0) return { realizadas: 0, ausencias: 0, revisadas: 0 }

  const asignaciones = [...new Set(abiertas.map((c) => c.caseAssignmentId).filter(Boolean))]
  const reportes = asignaciones.length
    ? await prisma.caseReport.findMany({
        where: { assignmentId: { in: asignaciones } },
        select: { outcome: true, createdAt: true, assignmentId: true },
      })
    : []

  const resumen = { realizadas: 0, ausencias: 0, revisadas: abiertas.length }

  for (const cita of abiertas) {
    const dijo = reporteDeLaCita(cita, reportes)?.outcome ?? null
    let nuevo = null
    let prueba = null

    if (dijo === REPORTE_NIEGA) {
      nuevo = ESTADOS.NO_ASISTIO
      prueba = 'el profesional reportó que no se presentó'
    } else if (huboSesion(cita, reportes)) {
      nuevo = ESTADOS.REALIZADA
      prueba = dijo ? 'el profesional reportó la sesión' : 'las dos personas entraron a la sala'
    }
    if (!nuevo) continue

    await AppointmentModel.update(cita.id, { status: nuevo })
    await registrar({
      req: null,
      action: ACCION.EDITAR,
      entity: 'cita',
      entityId: cita.id,
      actorEmail: 'sistema:cierre-de-sesiones',
      before: { estado: cita.status },
      after: { estado: nuevo, prueba },
    })

    if (nuevo === ESTADOS.REALIZADA) resumen.realizadas += 1
    else resumen.ausencias += 1
  }

  return resumen
}
