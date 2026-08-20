import { prisma } from '../config/database.js'

/**
 * MODELO: AvailabilityRule y AvailabilityException
 */
export const AvailabilityModel = {
  reglasDe(professionalId) {
    return prisma.availabilityRule.findMany({
      where: { professionalId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    })
  },

  crearRegla(data) {
    return prisma.availabilityRule.create({ data })
  },

  findRegla(id) {
    return prisma.availabilityRule.findUnique({ where: { id } })
  },

  actualizarRegla(id, data) {
    return prisma.availabilityRule.update({ where: { id }, data })
  },

  borrarRegla(id) {
    return prisma.availabilityRule.delete({ where: { id } })
  },

  /** Reemplaza de golpe todas las franjas de un profesional. */
  reemplazarReglas(professionalId, reglas) {
    return prisma.$transaction([
      prisma.availabilityRule.deleteMany({ where: { professionalId } }),
      prisma.availabilityRule.createMany({
        data: reglas.map((r) => ({ ...r, professionalId })),
      }),
    ])
  },

  bloqueosDe(professionalId, { desde, hasta } = {}) {
    return prisma.availabilityException.findMany({
      where: {
        professionalId,
        ...(desde ? { endsAt: { gt: desde } } : {}),
        ...(hasta ? { startsAt: { lt: hasta } } : {}),
      },
      orderBy: { startsAt: 'asc' },
    })
  },

  crearBloqueo(data) {
    return prisma.availabilityException.create({ data })
  },

  findBloqueo(id) {
    return prisma.availabilityException.findUnique({ where: { id } })
  },

  borrarBloqueo(id) {
    return prisma.availabilityException.delete({ where: { id } })
  },
}
