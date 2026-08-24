import { failure } from '../views/response.view.js'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuidValido(id) {
  return typeof id === 'string' && uuidRegex.test(id)
}

export function validarParamsUuid(req, res, next) {
  const { id } = req.params

  if (!id) {
    return res.status(400).json(failure('ID requerido'))
  }

  if (!uuidRegex.test(id)) {
    return res.status(404).json(failure('Registro no encontrado o ID no válido.'))
  }

  next()
}

export function validarParamId(req, res, next, id) {
  if (!id || !uuidRegex.test(id)) {
    return res.status(404).json(failure('Registro no encontrado o ID no válido.'))
  }
  next()
}

