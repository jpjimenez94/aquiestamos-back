import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { FeedbackController } from '../controllers/feedback.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { responderFeedbackSchema } from '../validators/feedback.schema.js'

export const feedbackRoutes = Router()

const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  },
})

feedbackRoutes.get('/:token', limite, FeedbackController.mostrar)
feedbackRoutes.post('/:token', limite, validateBody(responderFeedbackSchema), FeedbackController.responder)

export default feedbackRoutes
