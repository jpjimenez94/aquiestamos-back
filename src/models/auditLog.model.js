import { prisma } from '../config/database.js'

/**
 * MODELO: AuditLog
 * Solo se inserta y se consulta. No hay update ni delete a propósito.
 */
export const AuditLogModel = {
  create(data) {
    return prisma.auditLog.create({ data })
  },

  findAll({ skip = 0, take = 100, entity, actorId, desde, hasta } = {}) {
    return prisma.auditLog.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(actorId ? { actorId } : {}),
        ...(desde || hasta
          ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  },

  count({ entity, actorId } = {}) {
    return prisma.auditLog.count({
      where: { ...(entity ? { entity } : {}), ...(actorId ? { actorId } : {}) },
    })
  },
}
