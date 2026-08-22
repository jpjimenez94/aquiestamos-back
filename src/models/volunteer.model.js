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

  async findAll({ skip = 0, take = 50, status } = {}) {
    const volunteers = await prisma.volunteer.findMany({
      where: { ...vivos, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })

    const volunteerIds = volunteers.map((v) => v.id)
    if (volunteerIds.length === 0) return []

    const professionals = await prisma.professional.findMany({
      where: { volunteerId: { in: volunteerIds }, deletedAt: null },
      select: {
        id: true,
        volunteerId: true,
        professionalCardVerified: true,
        professionalCardNumber: true,
        professionalCardDocumentUrl: true,
      },
    })

    const profMap = new Map(professionals.map((p) => [p.volunteerId, p]))
    return volunteers.map((v) => ({
      ...v,
      professional: profMap.get(v.id) ?? null,
    }))
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
