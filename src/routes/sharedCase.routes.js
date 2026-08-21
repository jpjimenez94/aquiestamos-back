import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  authorizeSharedCase,
  getSharedCase,
  reportarCaso,
} from '../controllers/sharedCase.controller.js'
import { validarParamsUuid } from '../middlewares/validarUuid.js'
import { validateBody } from '../middlewares/validate.js'
import { caseReportCreateSchema } from '../validators/caseReport.schema.js'

export const sharedCaseRoutes = Router()

/**
 * Confirmar el correo es, en la practica, adivinar quien lleva un caso. Sin
 * limite, se puede probar una lista de correos contra un mismo enlace hasta
 * acertar. Es mas estricto que el de los formularios porque aqui hay datos de
 * salud detras.
 */
const limiteIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  },
})

// El acceso no lo da la sesion del portal, sino el enlace mas el correo.
sharedCaseRoutes.post('/:id/auth', limiteIntentos, validarParamsUuid, authorizeSharedCase)
sharedCaseRoutes.get('/:id', validarParamsUuid, getSharedCase)

// Responder qué pasó con la asignación. Va con el mismo token del enlace.
sharedCaseRoutes.post(
  '/:id/reporte',
  validarParamsUuid,
  validateBody(caseReportCreateSchema),
  reportarCaso,
)

export default sharedCaseRoutes
