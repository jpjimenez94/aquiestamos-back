import { ResourceModel } from '../models/resource.model.js'
import { ok, failure } from '../views/response.view.js'
import { resourceGroups, resourcePublic } from '../views/resource.view.js'

export const ResourceController = {
  async index(req, res, next) {
    try {
      const categories = await ResourceModel.findAllGrouped()
      return res.json(ok(resourceGroups(categories)))
    } catch (error) {
      next(error)
    }
  },

  async show(req, res, next) {
    try {
      const resource = await ResourceModel.findBySlug(req.params.slug)
      if (!resource || !resource.published) {
        return res.status(404).json(failure('Recurso no encontrado'))
      }
      return res.json(ok(resourcePublic(resource)))
    } catch (error) {
      next(error)
    }
  },
}
