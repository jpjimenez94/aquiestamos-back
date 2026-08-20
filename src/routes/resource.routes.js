import { Router } from 'express'
import { ResourceController } from '../controllers/resource.controller.js'

export const resourceRoutes = Router()

resourceRoutes.get('/', ResourceController.index)
resourceRoutes.get('/:slug', ResourceController.show)
