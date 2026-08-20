import { Router } from 'express'
import { VolunteerController } from '../controllers/volunteer.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { volunteerCreateSchema } from '../validators/volunteer.schema.js'

export const volunteerRoutes = Router()

// Público: formulario "Quiero ser parte"
volunteerRoutes.post('/', validateBody(volunteerCreateSchema), VolunteerController.store)

// Portal: consulta de postulaciones
volunteerRoutes.get('/', authenticate, authorize('postulacion:leer'), VolunteerController.index)
