import { Router } from 'express'
import { CollaboratorController } from '../controllers/collaborator.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { collaboratorCreateSchema } from '../validators/collaborator.schema.js'

export const collaboratorRoutes = Router()

// Público: formulario "Quiero apoyar".
collaboratorRoutes.post('/', validateBody(collaboratorCreateSchema), CollaboratorController.store)

// Portal: el directorio.
collaboratorRoutes.get('/', authenticate, authorize('colaborador:leer'), CollaboratorController.index)
