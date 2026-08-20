import { failure } from '../views/response.view.js'

/**
 * Middleware que valida `req.body` contra un esquema de Zod antes de que el
 * controlador llegue a tocarlo. Deja el resultado limpio en `req.validated`.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const details = {}
      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || 'form'
        if (!details[field]) details[field] = issue.message
      }
      return res.status(422).json(failure('Revisa los datos del formulario', details))
    }

    req.validated = result.data
    next()
  }
}
