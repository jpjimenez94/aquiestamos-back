import { AuditLogModel } from '../models/auditLog.model.js'
import { ok } from '../views/response.view.js'
import { listaAuditoria } from '../views/auditLog.view.js'

export const AuditLogController = {
  /** GET /api/audit */
  async index(req, res, next) {
    try {
      const page = Math.max(1, Number(req.query.page ?? 1))
      const perPage = Math.min(200, Math.max(1, Number(req.query.perPage ?? 100)))
      const filtros = {
        entity: req.query.entity || undefined,
        actorId: req.query.actorId || undefined,
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
