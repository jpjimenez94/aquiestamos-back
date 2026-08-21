import { prisma } from '../config/database.js'

const vivos = { deletedAt: null }

/**
 * MODELO: Patient
 */
export const PatientModel = {
  create(data) {
    return prisma.patient.create({ data })
  },

  findById(id) {
    return prisma.patient.findFirst({ where: { id, ...vivos } })
  },

  findBySupportRequestId(supportRequestId) {
    return prisma.patient.findFirst({ where: { supportRequestId, ...vivos } })
  },

  findAll({ status, city, skip = 0, take = 100 } = {}) {
    return prisma.patient.findMany({
      where: {
        ...vivos,
        ...(status ? { status } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
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
        assignments: { none: { status: 'ACTIVA', deletedAt: null } },
      },
      // Primero lo urgente y, dentro de cada nivel, quien lleva más esperando.
      // Sin el segundo criterio un caso de prioridad baja podría quedarse
      // al final de la cola para siempre.
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
