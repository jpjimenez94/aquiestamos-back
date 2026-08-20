import { prisma } from '../config/database.js'

/**
 * MODELO: Session
 */
export const SessionModel = {
  create(data) {
    return prisma.session.create({ data })
  },

  findByTokenHash(tokenHash) {
    return prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    })
  },

  revoke(id) {
    return prisma.session.update({ where: { id }, data: { revokedAt: new Date() } })
  },

  /** Cierra todas las sesiones de una persona: al cambiar clave o al darla de baja. */
  revokeAllForUser(userId) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  },

  findActiveForUser(userId) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
  },

  /** Limpieza de sesiones caducadas hace más de 30 días. */
  purgeExpired() {
    const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return prisma.session.deleteMany({ where: { expiresAt: { lt: limite } } })
  },
}
