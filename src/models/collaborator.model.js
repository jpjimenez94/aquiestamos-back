import { prisma } from '../config/database.js'

/** Los borrados lógicos no se devuelven nunca. */
const vivos = { deletedAt: null }

/**
 * MODELO: Collaborator
 *
 * El voluntariado de otras disciplinas. Es un directorio: se consulta y se
 * filtra, no se le agenda nada.
 */
export const CollaboratorModel = {
  create(data) {
    return prisma.collaborator.create({ data })
  },

  findById(id) {
    return prisma.collaborator.findFirst({ where: { id, ...vivos } })
  },

  findByEmail(email) {
    return prisma.collaborator.findFirst({ where: { email, ...vivos } })
  },

  /**
   * El listado del portal. Los filtros son los tres con los que de verdad se
   * busca a alguien: por área, por ciudad y por si puede ir presencial.
   */
  findAll({ skip = 0, take = 50, area, city, modality, status } = {}) {
    return prisma.collaborator.findMany({
      where: {
        ...vivos,
        ...(area ? { area } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(modality && modality !== 'AMBAS'
          ? { modality: { in: [modality, 'AMBAS'] } }
          : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  },

  count({ area, city, modality, status } = {}) {
    return prisma.collaborator.count({
      where: {
        ...vivos,
        ...(area ? { area } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(modality && modality !== 'AMBAS'
          ? { modality: { in: [modality, 'AMBAS'] } }
          : {}),
        ...(status ? { status } : {}),
      },
    })
  },

  /** Cuántas personas hay por área. Es lo que resume el directorio. */
  contarPorArea() {
    return prisma.collaborator.groupBy({
      by: ['area'],
      where: vivos,
      _count: true,
      orderBy: { _count: { area: 'desc' } },
    })
  },

  updateStatus(id, status) {
    return prisma.collaborator.update({ where: { id }, data: { status } })
  },

  /** Borrado lógico: el registro se conserva para la auditoría. */
  softDelete(id) {
    return prisma.collaborator.update({ where: { id }, data: { deletedAt: new Date() } })
  },
}
