import { Router } from 'express'
import { SupportRequestController } from '../controllers/supportRequest.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { supportRequestCreateSchema } from '../validators/supportRequest.schema.js'

export const supportRequestRoutes = Router()

// Público: formulario "Atención Psicológica"
supportRequestRoutes.post(
  '/',
  validateBody(supportRequestCreateSchema),
  SupportRequestController.store,
)

// Portal: consulta de solicitudes
supportRequestRoutes.get(
  '/',
  authenticate,
  authorize('solicitud:leer'),
  SupportRequestController.index,
)

// Portal: eliminar solicitud — solo ADMIN (borrado lógico, registro queda para auditoría)
supportRequestRoutes.delete(
  '/:id',
  authenticate,
  authorize('solicitud:eliminar'),
  SupportRequestController.destroy,
)
