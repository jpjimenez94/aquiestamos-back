import { prisma } from '../config/database.js'

/** Los registros con `deletedAt` no existen para el resto de la aplicación. */
const vivos = { deletedAt: null }

/**
 * MODELO: Volunteer
 * Único punto del backend que habla con la tabla `volunteers`.
 */
export const VolunteerModel = {
  create(data) {
    return prisma.volunteer.create({ data })
  },

  findById(id) {
    return prisma.volunteer.findFirst({ where: { id, ...vivos } })
  },

  findAll({ skip = 0, take = 50, status } = {}) {
    return prisma.volunteer.findMany({
      where: { ...vivos, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  },

  count({ status } = {}) {
    return prisma.volunteer.count({ where: { ...vivos, ...(status ? { status } : {}) } })
  },

  updateStatus(id, status) {
    return prisma.volunteer.update({ where: { id }, data: { status } })
  },

  /** Borrado lógico: el registro se conserva para la auditoría. */
  softDelete(id) {
    return prisma.volunteer.update({ where: { id }, data: { deletedAt: new Date() } })
  },
}
