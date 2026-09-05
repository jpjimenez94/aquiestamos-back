import { Router } from 'express'
import { CuidadoController } from '../controllers/cuidado.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { validateBody } from '../middlewares/validate.js'
import { validarParamId } from '../middlewares/validarUuid.js'
import {
  convocarSesionSchema,
  estadoSesionSchema,
  asistenciaSchema,
  supervisorSchema,
} from '../validators/cuidado.schema.js'

/**
 * Cuidado del equipo, lado del portal: con sesión y con permiso, como todo
 * lo demás del portal. Regla 2 del MAPA: el permiso se declara en
 * `permissions.js`, no con un if de rol aquí.
 *
 *   cuidado:leer      ver quién pidió el espacio, supervisores y sesiones
 *   cuidado:gestionar convocar, cerrar y marcar asistencia
 */
export const cuidadoRoutes = Router()
cuidadoRoutes.use(authenticate)

cuidadoRoutes.get('/', authorize('cuidado:leer'), CuidadoController.resumen)

cuidadoRoutes.post(
  '/sesiones',
  authorize('cuidado:gestionar'),
  validateBody(convocarSesionSchema),
  CuidadoController.convocar,
)

cuidadoRoutes.patch(
  '/sesiones/:id/estado',
  authorize('cuidado:gestionar'),
  validarParamId,
  validateBody(estadoSesionSchema),
  CuidadoController.cambiarEstado,
)

cuidadoRoutes.patch(
  '/sesiones/:id/asistencia',
  authorize('cuidado:gestionar'),
  validarParamId,
  validateBody(asistenciaSchema),
  CuidadoController.asistencia,
)

cuidadoRoutes.patch(
  '/supervisores/:id',
  authorize('cuidado:gestionar'),
  validarParamId,
  validateBody(supervisorSchema),
  CuidadoController.supervisor,
)

export default cuidadoRoutes
