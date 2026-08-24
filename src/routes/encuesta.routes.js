import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { EncuestaController } from '../controllers/encuesta.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { responderEncuestaSchema } from '../validators/encuesta.schema.js'

export const encuestaRoutes = Router()

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  },
})

encuestaRoutes.get('/:token', limite, EncuestaController.mostrar)
encuestaRoutes.post('/:token', limite, validateBody(responderEncuestaSchema), EncuestaController.responder)

export default encuestaRoutes
