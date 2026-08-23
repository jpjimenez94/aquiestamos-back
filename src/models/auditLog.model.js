import { prisma } from '../config/database.js'

/**
 * MODELO: AuditLog
 * Solo se inserta y se consulta. No hay update ni delete a propósito.
 */

/**
 * El where se arma UNA vez y lo comparten la lista y el conteo: dos sitios
 * armando el filtro es la receta para que la paginación diga un total y la
 * tabla muestre otro.
 */
function armarWhere({ entity, action, actorId, rol, soloSistema, q, desde, hasta } = {}) {
  return {
    ...(entity ? { entity } : {}),
    ...(action ? { action } : {}),
    ...(actorId ? { actorId } : {}),
    // Filtrar por rol usa la relación con la cuenta: las entradas de cuentas
    // borradas (actor null) no salen aquí, y está bien: para eso está "sistema".
    ...(rol ? { actor: { role: rol } } : {}),
    // Lo que hizo el sistema o alguien sin sesión: barridos, tamizajes, firmas.
    ...(soloSistema ? { actorId: null } : {}),
    ...(q
      ? {
          OR: [
            { actorEmail: { contains: q, mode: 'insensitive' } },
            { entityId: { contains: q, mode: 'insensitive' } },
            { ip: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(desde || hasta
      ? {
          createdAt: {
            ...(desde ? { gte: desde } : {}),
            // `hasta` llega como el día SIGUIENTE exclusivo: así "hasta el 23"
            // incluye todo el 23 sin pelear con zonas horarias.
            ...(hasta ? { lt: hasta } : {}),
          },
        }
      : {}),
  }
}

export const AuditLogModel = {
  create(data) {
    return prisma.auditLog.create({ data })
  },

  findAll({ skip = 0, take = 100, ...filtros } = {}) {
    return prisma.auditLog.findMany({
      where: armarWhere(filtros),
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  },

  count(filtros = {}) {
    return prisma.auditLog.count({ where: armarWhere(filtros) })
  },
}
