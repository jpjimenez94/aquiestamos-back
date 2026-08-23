import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { ConsentimientoController } from '../controllers/consentimiento.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { firmarConsentimientoSchema } from '../validators/consentimiento.schema.js'

export const consentimientoRoutes = Router()

// Mismo criterio que el tamizaje: el token no se adivina, pero el límite
// evita que un enlace filtrado sirva para martillar la base.
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

consentimientoRoutes.get('/:token', limite, ConsentimientoController.mostrar)
consentimientoRoutes.post(
  '/:token',
  limite,
  validateBody(firmarConsentimientoSchema),
  ConsentimientoController.firmar,
)

export default consentimientoRoutes
