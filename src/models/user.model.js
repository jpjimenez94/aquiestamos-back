import { prisma } from '../config/database.js'

/**
 * MODELO: User
 * Todas las consultas excluyen los registros con `deletedAt` salvo que se pida
 * lo contrario de forma explícita.
 */
const vivos = { deletedAt: null }
const esUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

export const UserModel = {
  create(data) {
    return prisma.user.create({ data })
  },

  findById(id) {
    if (!esUuid(id)) return null
    return prisma.user.findFirst({ where: { id, ...vivos } })
  },

  findByEmail(email) {
    return prisma.user.findFirst({ where: { email: email.toLowerCase(), ...vivos } })
  },

  /**
   * Filtrar por rol mira los DOS campos, no solo el viejo.
   *
   * Esto filtraba solo por la columna `role`. La usa, entre otras cosas, la
   * guarda de «debe quedar al menos un administrador activo»: con el filtro
   * viejo, una cuenta que es administradora por `roles: ['ADMIN']` no se
   * contaba, así que se podía borrar al último administrador de verdad
   * creyendo que quedaban otros. Quedarse fuera del portal no se arregla
   * desde el portal.
   */
  findAll({ role } = {}) {
    return prisma.user.findMany({
      where: {
        ...vivos,
        ...(role ? { OR: [{ role }, { roles: { has: role } }] } : {}),
      },
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
