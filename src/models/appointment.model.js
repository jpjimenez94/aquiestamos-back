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

/**
 * Las citas de alguien que ya no está no son agenda.
 *
 * Borrar a una persona la sacaba de «Acompañadas», pero sus citas seguían
 * pintadas en el calendario semanal y en el historial: quien coordinaba veía
 * «prueba / Prueba» y «JUAN PABLO» ocupando la semana entre las personas
 * reales, sin forma de quitarlos desde ninguna pantalla.
 *
 * La misma pregunta —¿cuenta esta persona?— ya se decidía en el informe, y
 * allí se respondía que no. Dos sitios decidiendo lo mismo por su cuenta, y
 * cada uno eligió lo contrario: el informe se quedó corto y el calendario, de
 * más. Aquí queda escrita una vez, del lado de la consulta, que es donde
 * ninguna pantalla puede olvidarse de aplicarla.
 */
const PERSONA_VIVA = { patient: { deletedAt: null } }

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
        ...PERSONA_VIVA,
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
        ...PERSONA_VIVA,
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
