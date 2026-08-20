import { failure } from '../views/response.view.js'

export function validarParamsUuid(req, res, next) {
  const { id } = req.params
  
  if (!id) {
    return res.status(400).json(failure('ID requerido'))
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  
  if (!uuidRegex.test(id)) {
    return res.status(400).json(failure('El ID proporcionado no es válido.'))
  }
  
  next()
}
