import { prisma } from '../config/database.js'

const vivos = { deletedAt: null }
const esUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

/**
 * MODELO: Professional
 */
export const ProfessionalModel = {
  create(data) {
    return prisma.professional.create({ data })
  },

  findById(id) {
    if (!esUuid(id)) return null
    return prisma.professional.findFirst({ where: { id, ...vivos } })
  },

  findByUserId(userId) {
    if (!esUuid(userId)) return null
    return prisma.professional.findFirst({ where: { userId, ...vivos } })
  },

  findByVolunteerId(volunteerId) {
    if (!esUuid(volunteerId)) return null
    return prisma.professional.findFirst({ where: { volunteerId, ...vivos } })
  },

  findAll({ status, city, modality, skip, take } = {}) {
    return prisma.professional.findMany({
      where: {
        ...vivos,
        ...(status ? { status } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(modality && modality !== 'AMBAS' ? { modality: { in: [modality, 'AMBAS'] } } : {}),
      },
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
      ...(skip !== undefined ? { skip: Number(skip) } : {}),
      ...(take !== undefined ? { take: Number(take) } : {}),
    })
  },

  /**
   * Candidatos para atender a una persona.
   * Filtra estrictamente por modalidad:
   * - Si la persona pide PRESENCIAL -> solo profesionales PRESENCIAL o AMBAS
   * - Si la persona pide VIRTUAL -> solo profesionales VIRTUAL o AMBAS
   * - Si es AMBAS o INDIFERENTE -> no restringe modalidad
   */
  findCandidatos({ populations, modality, city }) {
    let modalidadFiltro = undefined
    if (modality === 'PRESENCIAL') {
      modalidadFiltro = { in: ['PRESENCIAL', 'AMBAS'] }
    } else if (modality === 'VIRTUAL') {
      modalidadFiltro = { in: ['VIRTUAL', 'AMBAS'] }
    }

    return prisma.professional.findMany({
      where: {
        ...vivos,
        status: 'ACTIVO',
        ...(modalidadFiltro ? { modality: modalidadFiltro } : {}),
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
