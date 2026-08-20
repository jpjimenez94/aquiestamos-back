import { puede } from '../auth/permissions.js'
import { failure } from '../views/response.view.js'

/**
 * Exige un permiso concreto. Se usa siempre después de `authenticate`.
 *
 *   router.get('/', authenticate, authorize('solicitud:leer'), Controller.index)
 */
export function authorize(permiso) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json(failure('Necesitas iniciar sesión'))
    }
    if (!puede(req.usuario, permiso)) {
      return res
        .status(403)
        .json(failure('Tu rol no tiene permiso para hacer esto', { permiso }))
    }
    next()
  }
}
