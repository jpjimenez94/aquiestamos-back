import { prisma } from '../config/database.js'

const CON_PERSONAS = {
  professional: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      // El detalle de la cita enseña el paso legal de la tarjeta. Sin estos
      // campos el portal decía "Sin verificar" siempre, verificada o no.
      professionalCardVerified: true,
      professionalCardNumber: true,
      professionalCardDocumentUrl: true,
    },
  },
  patient: { select: { id: true, fullName: true, phone: true, email: true, isMinor: true, preferredContact: true } },
  accessLogs: {
    orderBy: { lastPingAt: 'desc' },
    take: 10,
  },
}

const esUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

/**
 * MODELO: Appointment
 */
export const AppointmentModel = {
  create(data) {
    return prisma.appointment.create({ data, include: CON_PERSONAS })
  },

  findById(id) {
    if (!esUuid(id)) return null
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

  /** Historial completo con filtros avanzados de búsqueda y orden descendente */
  findHistorial({ desde, hasta, professionalId, patientId, status, search, skip = 0, take = 200 } = {}) {
    return prisma.appointment.findMany({
      where: {
        ...(desde || hasta
          ? {
              startsAt: {
                ...(desde ? { gte: desde } : {}),
                ...(hasta ? { lte: hasta } : {}),
              },
            }
          : {}),
        ...(professionalId ? { professionalId } : {}),
        ...(patientId ? { patientId } : {}),
        ...(status ? { status: { in: Array.isArray(status) ? status : [status] } } : {}),
        ...(search
          ? {
              OR: [
                { patient: { fullName: { contains: search, mode: 'insensitive' } } },
                { patient: { phone: { contains: search } } },
                { professional: { fullName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: CON_PERSONAS,
      orderBy: { startsAt: 'desc' },
      skip,
      take,
    })
  },

  /** Todas las citas de un paciente, de la más próxima a la más lejana. */
  findDePaciente(patientId) {
    return prisma.appointment.findMany({
      where: { patientId },
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
