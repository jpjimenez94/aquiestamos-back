import { prisma } from '../config/database.js'

/**
 * MODELO: Resource / ResourceCategory
 * Biblioteca "Recursos para todos".
 */
export const ResourceModel = {
  findAllGrouped() {
    return prisma.resourceCategory.findMany({
      orderBy: { position: 'asc' },
      include: {
        resources: {
          where: { published: true, deletedAt: null },
          orderBy: { position: 'asc' },
        },
      },
    })
  },

  findAll() {
    return prisma.resource.findMany({
      where: { published: true, deletedAt: null },
      orderBy: [{ category: { position: 'asc' } }, { position: 'asc' }],
      include: { category: true },
    })
  },

  findBySlug(slug) {
    return prisma.resource.findFirst({
      where: { slug, deletedAt: null },
      include: { category: true },
    })
  },
}
