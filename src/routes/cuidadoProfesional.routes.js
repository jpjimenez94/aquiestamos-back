import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { CuidadoProfesionalController } from '../controllers/cuidadoProfesional.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { checkInSchema } from '../validators/cuidado.schema.js'

/**
 * «¿Cómo estás tú?»: pública, como el tamizaje o la agenda de la persona.
 *
 * Quien la abre no tiene cuenta en el portal, solo su enlace. El límite es
 * holgado: abrir el espacio, leerlo, cerrarlo y volver al rato es lo normal
 * cuando alguien está decidiendo si pedir ayuda.
 */
const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas peticiones. Espera un momento.' },
})

export const cuidadoProfesionalRoutes = Router()

cuidadoProfesionalRoutes.get('/:token', limite, CuidadoProfesionalController.mostrar)
cuidadoProfesionalRoutes.post(
  '/:token',
  limite,
  validateBody(checkInSchema),
  CuidadoProfesionalController.registrar,
)

export default cuidadoProfesionalRoutes
