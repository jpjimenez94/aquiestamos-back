import { Router } from 'express'
import { CollaboratorController } from '../controllers/collaborator.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { collaboratorCreateSchema, collaboratorUpdateSchema } from '../validators/collaborator.schema.js'

export const collaboratorRoutes = Router()

// Público: formulario "Quiero apoyar".
collaboratorRoutes.post('/', validateBody(collaboratorCreateSchema), CollaboratorController.store)

// Portal: el directorio y gestión de colaboradores.
collaboratorRoutes.get('/', authenticate, authorize('colaborador:leer'), CollaboratorController.index)
collaboratorRoutes.get('/:id', authenticate, authorize('colaborador:leer'), CollaboratorController.show)
collaboratorRoutes.patch('/:id', authenticate, authorize('colaborador:editar'), validateBody(collaboratorUpdateSchema), CollaboratorController.update)
collaboratorRoutes.delete('/:id', authenticate, authorize('colaborador:eliminar'), CollaboratorController.destroy)
