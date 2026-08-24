import { prisma } from '../config/database.js'
import { VIVOS } from '../services/assignmentState.service.js'

const vivos = { deletedAt: null }
const esUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

/**
 * MODELO: Patient
 */
export const PatientModel = {
  create(data) {
    return prisma.patient.create({ data })
  },

  findById(id) {
    if (!esUuid(id)) return null
    return prisma.patient.findFirst({
      where: { id, ...vivos },
      include: {
        assignments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { professional: true },
        },
        appointments: {
          orderBy: { startsAt: 'desc' },
          include: { professional: true },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })
  },

  findBySupportRequestId(supportRequestId) {
    if (!esUuid(supportRequestId)) return null
    return prisma.patient.findFirst({ where: { supportRequestId, ...vivos } })
  },

  findAll({ status, city, skip = 0, take = 100 } = {}) {
    return prisma.patient.findMany({
      where: {
        ...vivos,
        ...(status ? { status } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      },
      include: {
        assignments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { professional: true },
        },
        appointments: {
          orderBy: { startsAt: 'desc' },
          include: { professional: true },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      },
      // Los que llevan más tiempo esperando, primero.
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      skip,
      take,
    })
  },

  /** Personas admitidas que todavía no tienen profesional asignado. */
  findSinAsignar() {
    return prisma.patient.findMany({
      where: {
        ...vivos,
        status: { in: ['NUEVO', 'EN_ADMISION'] },
        assignments: { none: { status: { in: VIVOS }, deletedAt: null } },
      },
      include: {
        assignments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { professional: true },
        },
        appointments: {
          orderBy: { startsAt: 'desc' },
          include: { professional: true },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      },
      // Primero lo urgente y, dentro de cada nivel, quien lleva más esperando.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })
  },

  count({ status } = {}) {
    return prisma.patient.count({ where: { ...vivos, ...(status ? { status } : {}) } })
  },

  update(id, data) {
    return prisma.patient.update({ where: { id }, data })
  },

  softDelete(id) {
    return prisma.patient.update({ where: { id }, data: { deletedAt: new Date() } })
  },
}
