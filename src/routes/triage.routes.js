import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { TriageController } from '../controllers/triage.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { triageResponseSchema } from '../validators/triage.schema.js'

export const triageRoutes = Router()

/**
 * El token es imposible de adivinar, pero el límite igual va: sin él, un
 * enlace filtrado se puede usar para llenar la tabla de respuestas falsas y
 * enterrar la de verdad. Es más holgado que el del caso compartido porque aquí
 * no se está adivinando nada, solo respondiendo.
 */
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

triageRoutes.get('/:token', limite, TriageController.mostrar)
triageRoutes.post('/:token', limite, validateBody(triageResponseSchema), TriageController.responder)

export default triageRoutes
