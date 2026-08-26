import { AuditLogModel } from '../models/auditLog.model.js'
import { ok } from '../views/response.view.js'
import { listaAuditoria } from '../views/auditLog.view.js'
import { ROLES } from '../auth/permissions.js'
const ACCIONES = [
  'acceder',
  'acceso_fallido',
  'salir',
  'consultar',
  'crear',
  'editar',
  'borrar',
  'cambiar_clave',
]

/** Una fecha de un <input type="date">, o undefined si no vino o no es fecha. */
function fecha(valor) {
  if (!valor) return undefined
  const d = new Date(`${valor}T00:00:00-05:00`) // los filtros se piensan en hora de Bogotá
  return Number.isNaN(d.getTime()) ? undefined : d
}

export const AuditLogController = {
  /** GET /api/audit */
  async index(req, res, next) {
    try {
      const page = Math.max(1, Number(req.query.page ?? 1))
      const perPage = Math.min(1000, Math.max(1, Number(req.query.perPage ?? 500)))

      const hastaDia = fecha(req.query.hasta)
      const filtros = {
        entity: req.query.entity || undefined,
        actorId: req.query.actorId || undefined,
        // Lo que no está en la lista no filtra: un valor inventado en la URL
        // no debe convertirse en un where.
        action: ACCIONES.includes(req.query.action) ? req.query.action : undefined,
        rol: ROLES.includes(req.query.rol) ? req.query.rol : undefined,
        soloSistema: req.query.sistema === '1',
        q: String(req.query.q ?? '').trim().slice(0, 120) || undefined,
        desde: fecha(req.query.desde),
        // "hasta el 23" incluye el 23: se manda el día siguiente, exclusivo.
        hasta: hastaDia ? new Date(hastaDia.getTime() + 24 * 3600 * 1000) : undefined,
      }

      const [entradas, total] = await Promise.all([
        AuditLogModel.findAll({ ...filtros, skip: (page - 1) * perPage, take: perPage }),
        AuditLogModel.count(filtros),
      ])

      return res.json(ok(listaAuditoria(entradas), { page, perPage, total }))
    } catch (error) {
      next(error)
    }
  },
}
