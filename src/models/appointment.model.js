import { prisma } from '../config/database.js'

const CON_PERSONAS = {
  professional: { select: { id: true, fullName: true, phone: true, email: true } },
  patient: { select: { id: true, fullName: true, phone: true, email: true, isMinor: true } },
}

/**
 * MODELO: Appointment
 */
export const AppointmentModel = {
  create(data) {
    return prisma.appointment.create({ data, include: CON_PERSONAS })
  },

  findById(id) {
    return prisma.appointment.findUnique({ where: { id }, include: CON_PERSONAS })
  },

  /** Agenda de un rango. Sin filtro de profesional, devuelve la de toda la red. */
  findEnRango({ desde, hasta, professionalId, patientId, status }) {
    return prisma.appointment.findMany({
      where: {
        startsAt: { gte: desde, lt: hasta },
        ...(professionalId ? { professionalId } : {}),
        ...(patientId ? { patientId } : {}),
        ...(status ? { status: { in: Array.isArray(status) ? status : [status] } } : {}),
      },
      include: CON_PERSONAS,
      orderBy: { startsAt: 'asc' },
    })
  },

  /** Las próximas citas de un profesional. Es lo que ve en su portal. */
  proximasDeProfesional(professionalId, { desde = new Date(), take = 50 } = {}) {
    return prisma.appointment.findMany({
      where: {
        professionalId,
        startsAt: { gte: desde },
        status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
      },
      include: CON_PERSONAS,
      orderBy: { startsAt: 'asc' },
      take,
    })
  },

  update(id, data) {
    return prisma.appointment.update({ where: { id }, data, include: CON_PERSONAS })
  },

  contarPorEstado({ desde, hasta } = {}) {
    return prisma.appointment.groupBy({
      by: ['status'],
      where: desde || hasta ? { startsAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: hasta } : {}) } } : undefined,
      _count: { _all: true },
    })
  },
}
