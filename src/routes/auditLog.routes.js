import { Router } from 'express'
import { AuditLogController } from '../controllers/auditLog.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'

export const auditLogRoutes = Router()

auditLogRoutes.get('/', authenticate, authorize('auditoria:leer'), AuditLogController.index)
