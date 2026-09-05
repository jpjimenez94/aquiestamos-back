import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  actualizarDisponibilidad,
  authorizeSharedCase,
  getSharedCase,
  reportarCaso,
  responderPropuesta,
} from '../controllers/sharedCase.controller.js'
import { reemplazarFranjasSchema } from '../validators/agenda.schema.js'
import { validarParamsUuid } from '../middlewares/validarUuid.js'
import { validateBody } from '../middlewares/validate.js'
import { caseReportCreateSchema } from '../validators/caseReport.schema.js'
import { respuestaPropuestaSchema } from '../validators/propuesta.schema.js'

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

/**
 * Corregir su propia agenda desde el enlace.
 *
 * Le pedimos confirmar que sus espacios siguen vigentes y, si cambiaron,
 * decírnoslo — y no tenía dónde. La ruta del portal exige cuenta, que él no
 * tiene a propósito. El token decide de quién es la agenda que se toca: nunca
 * se lee un identificador de profesional de la URL.
 */
sharedCaseRoutes.put(
  '/:id/disponibilidad',
  validarParamsUuid,
  validateBody(reemplazarFranjasSchema),
  actualizarDisponibilidad,
)

// Aceptar o rechazar el caso que le proponen, y decir cuándo puede.
sharedCaseRoutes.post(
  '/:id/propuesta',
  validarParamsUuid,
  validateBody(respuestaPropuestaSchema),
  responderPropuesta,
)

// Responder qué pasó con la asignación. Va con el mismo token del enlace.
sharedCaseRoutes.post(
  '/:id/reporte',
  validarParamsUuid,
  validateBody(caseReportCreateSchema),
  reportarCaso,
)

// Cuidado del equipo, con el mismo token del enlace: cómo va, «¿cómo estás
// tú?», y ofrecerse como supervisor. Ver el bloque al final del controlador.
sharedCaseRoutes.get('/:id/cuidado', validarParamsUuid, cuidadoDelProfesional)
sharedCaseRoutes.post(
  '/:id/cuidado/check-in',
  validarParamsUuid,
  validateBody(checkInSchema),
  registrarCheckIn,
)
sharedCaseRoutes.put(
  '/:id/cuidado/supervisor',
  validarParamsUuid,
  validateBody(supervisorSchema),
  ofrecerseComoSupervisor,
)

export default sharedCaseRoutes

import {
  cuidadoDelProfesional,
  registrarCheckIn,
  ofrecerseComoSupervisor,
} from '../controllers/sharedCase.controller.js'
import { checkInSchema, supervisorSchema } from '../validators/cuidado.schema.js'
