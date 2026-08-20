import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { AuthController } from '../controllers/auth.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { validateBody } from '../middlewares/validate.js'
import { loginSchema, cambiarClaveSchema } from '../validators/auth.schema.js'

export const authRoutes = Router()

// El bloqueo por cuenta protege una cuenta concreta; este límite por IP evita
// que alguien pruebe muchas cuentas distintas desde el mismo sitio.
const limiteAcceso = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos desde esta conexión. Espera unos minutos.',
  },
})

authRoutes.post('/login', limiteAcceso, validateBody(loginSchema), AuthController.login)
authRoutes.post('/logout', authenticate, AuthController.logout)
authRoutes.get('/me', authenticate, AuthController.me)
authRoutes.post(
  '/cambiar-clave',
  authenticate,
  validateBody(cambiarClaveSchema),
  AuthController.cambiarClave,
)
