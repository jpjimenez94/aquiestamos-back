import { Router } from 'express'
import { z } from 'zod'
import { UserController } from '../controllers/user.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import { validateBody } from '../middlewares/validate.js'
import { crearUsuarioSchema, editarUsuarioSchema } from '../validators/auth.schema.js'
import { CLAVE_MIN } from '../auth/password.js'

export const userRoutes = Router()

const restablecerSchema = z.object({
  password: z
    .string({ required_error: 'Campo obligatorio' })
    .min(CLAVE_MIN, `La clave debe tener al menos ${CLAVE_MIN} caracteres`)
    .max(200)
    .regex(/[a-záéíóúñ]/i, 'La clave debe incluir alguna letra')
    .regex(/[0-9]/, 'La clave debe incluir algún número'),
})

// Toda la gestión de cuentas es exclusiva del administrador.
userRoutes.use(authenticate)

userRoutes.get('/', authorize('usuario:leer'), UserController.index)
userRoutes.post('/', authorize('usuario:crear'), validateBody(crearUsuarioSchema), UserController.store)
userRoutes.patch('/:id', authorize('usuario:editar'), validateBody(editarUsuarioSchema), UserController.update)
userRoutes.delete('/:id', authorize('usuario:borrar'), UserController.destroy)
userRoutes.post(
  '/:id/restablecer-clave',
  authorize('usuario:editar'),
  validateBody(restablecerSchema),
  UserController.resetPassword,
)
