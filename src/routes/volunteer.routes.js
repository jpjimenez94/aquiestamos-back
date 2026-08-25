import { Router } from 'express'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { VolunteerController } from '../controllers/volunteer.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { volunteerCreateSchema } from '../validators/volunteer.schema.js'
import { TAMANO_MAXIMO } from '../almacenamiento/documentos.js'

export const volunteerRoutes = Router()

// Rate limiting para la subida de documentos previa al envío
const limiteSubida = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  },
})

// Subida de archivos previa al registro de postulación
volunteerRoutes.post(
  '/upload',
  limiteSubida,
  express.raw({ type: '*/*', limit: TAMANO_MAXIMO }),
  VolunteerController.subirArchivo,
)

// Público: formulario "Quiero ser parte"
volunteerRoutes.post('/', validateBody(volunteerCreateSchema), VolunteerController.store)

// Portal: consulta de postulaciones
volunteerRoutes.get('/', authenticate, authorize('postulacion:leer'), VolunteerController.index)

// Portal: eliminar postulación (ADMIN)
volunteerRoutes.delete('/:id', authenticate, authorize('postulacion:eliminar'), VolunteerController.destroy)
