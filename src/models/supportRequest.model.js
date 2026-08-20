import { prisma } from '../config/database.js'

/** Los registros con `deletedAt` no existen para el resto de la aplicación. */
const vivos = { deletedAt: null }

/**
 * MODELO: SupportRequest
 * Solicitudes de acompañamiento enviadas desde "Atención Psicológica".
 */
export const SupportRequestModel = {
  create(data) {
    return prisma.supportRequest.create({ data })
  },

  findById(id) {
    return prisma.supportRequest.findFirst({ where: { id, ...vivos } })
  },

  findAll({ skip = 0, take = 50, status } = {}) {
    return prisma.supportRequest.findMany({
      where: { ...vivos, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  },

  count({ status } = {}) {
    return prisma.supportRequest.count({ where: { ...vivos, ...(status ? { status } : {}) } })
  },

  updateStatus(id, status) {
    return prisma.supportRequest.update({ where: { id }, data: { status } })
  },

  /** Borrado lógico: el registro se conserva para la auditoría. */
  softDelete(id) {
    return prisma.supportRequest.update({ where: { id }, data: { deletedAt: new Date() } })
  },
}
