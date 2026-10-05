import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { DesistimientoController } from '../controllers/desistimiento.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { desistimientoSchema } from '../validators/consentimiento.schema.js'

/**
 * La constancia de desistimiento: puerta pública, como el consentimiento.
 *
 * Quien la abre no tiene cuenta en el portal — solo su enlace. El límite es el
 * mismo criterio de siempre: el token no se adivina, pero si uno se filtra que
 * no sirva para martillar la base.
 */
export const desistimientoRoutes = Router()

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

desistimientoRoutes.get('/:token', limite, DesistimientoController.mostrar)
desistimientoRoutes.post(
  '/:token',
  limite,
  validateBody(desistimientoSchema),
  DesistimientoController.aceptar,
)

export default desistimientoRoutes
