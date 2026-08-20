import { failure } from '../views/response.view.js'

export function notFound(req, res) {
  res.status(404).json(failure(`Ruta no encontrada: ${req.method} ${req.originalUrl}`))
}
