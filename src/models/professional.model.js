import { prisma } from '../config/database.js'

const vivos = { deletedAt: null }

/**
 * MODELO: Professional
 */
export const ProfessionalModel = {
  create(data) {
    return prisma.professional.create({ data })
  },

  findById(id) {
    return prisma.professional.findFirst({ where: { id, ...vivos } })
  },

  findByUserId(userId) {
    return prisma.professional.findFirst({ where: { userId, ...vivos } })
  },

  findByVolunteerId(volunteerId) {
    return prisma.professional.findFirst({ where: { volunteerId, ...vivos } })
  },

  findAll({ status, city, modality, skip = 0, take = 100 } = {}) {
    return prisma.professional.findMany({
      where: {
        ...vivos,
        ...(status ? { status } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(modality && modality !== 'AMBAS' ? { modality: { in: [modality, 'AMBAS'] } } : {}),
      },
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
      skip,
      take,
    })
  },

  /**
   * Candidatos para atender a una persona. El filtro fino (cupo y huecos) lo
   * hace el servicio de emparejamiento: aquí solo se reduce el conjunto.
   */
  findCandidatos({ populations, modality, city }) {
    return prisma.professional.findMany({
      where: {
        ...vivos,
        status: 'ACTIVO',
        ...(modality && modality !== 'INDIFERENTE'
          ? { modality: { in: [modality, 'AMBAS'] } }
          : {}),
        ...(populations?.length ? { populations: { hasSome: populations } } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      },
      orderBy: { fullName: 'asc' },
    })
  },

  count({ status } = {}) {
    return prisma.professional.count({ where: { ...vivos, ...(status ? { status } : {}) } })
  },

  update(id, data) {
    return prisma.professional.update({ where: { id }, data })
  },

  softDelete(id) {
    return prisma.professional.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVO' },
    })
  },
}
