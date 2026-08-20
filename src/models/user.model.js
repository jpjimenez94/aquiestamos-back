import { prisma } from '../config/database.js'

/**
 * MODELO: User
 * Todas las consultas excluyen los registros con `deletedAt` salvo que se pida
 * lo contrario de forma explícita.
 */
const vivos = { deletedAt: null }

export const UserModel = {
  create(data) {
    return prisma.user.create({ data })
  },

  findById(id) {
    return prisma.user.findFirst({ where: { id, ...vivos } })
  },

  findByEmail(email) {
    return prisma.user.findFirst({ where: { email: email.toLowerCase(), ...vivos } })
  },

  findAll({ role } = {}) {
    return prisma.user.findMany({
      where: { ...vivos, ...(role ? { role } : {}) },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  },

  count() {
    return prisma.user.count({ where: vivos })
  },

  update(id, data) {
    return prisma.user.update({ where: { id }, data })
  },

  /** Borrado lógico: el registro se conserva para la auditoría. */
  softDelete(id) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    })
  },

  registrarAcceso(id) {
    return prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null },
    })
  },

  registrarFallo(id, intentos, bloqueadoHasta) {
    return prisma.user.update({
      where: { id },
      data: { failedAttempts: intentos, lockedUntil: bloqueadoHasta },
    })
  },
}
