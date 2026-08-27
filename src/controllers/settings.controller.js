import { SettingsService } from '../services/settings.service.js'
import { ok, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'

export const SettingsController = {
  /** GET /api/settings */
  async index(req, res, next) {
    try {
      const { category } = req.query
      const items = await SettingsService.getAll({ category: category || undefined })
      return res.json(ok(items))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/settings/:key */
  async show(req, res, next) {
    try {
      const { key } = req.params
      const item = await SettingsService.getByKey(key)
      if (!item) {
        return res.status(404).json(failure('Configuración no encontrada.'))
      }
      return res.json(ok(item))
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/settings/:key */
  async update(req, res, next) {
    try {
      const { key } = req.params
      const { value } = req.validated
      const userEmail = req.usuario?.email || 'admin@redaquiestamos.org'

      const existing = await SettingsService.getByKey(key)
      if (!existing) {
        return res.status(404).json(failure('Configuración no encontrada.'))
      }

      const updated = await SettingsService.update(key, value, userEmail)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'configuracion',
        entityId: key,
        before: { value: existing.value },
        after: { value: updated.value },
      })

      return res.json(ok(updated, 'Configuración actualizada exitosamente.'))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/settings/:key/reset */
  async reset(req, res, next) {
    try {
      const { key } = req.params
      const userEmail = req.usuario?.email || 'admin@redaquiestamos.org'

      const existing = await SettingsService.getByKey(key)
      if (!existing) {
        return res.status(404).json(failure('Configuración no encontrada.'))
      }

      const reseted = await SettingsService.reset(key, userEmail)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'configuracion',
        entityId: key,
        after: { value: reseted.value, restablecido: true },
      })

      return res.json(ok(reseted, 'Configuración restablecida al valor de fábrica.'))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/settings/preview */
  async preview(req, res, next) {
    try {
      const { template, variables } = req.validated
      const rendered = SettingsService.interpolate(template, variables)
      return res.json(ok({ rendered }))
    } catch (error) {
      next(error)
    }
  },
}
