import { z } from 'zod'
import { CLAVE_MIN } from '../auth/password.js'
import { ROLES } from '../auth/permissions.js'

const requerido = { required_error: 'Campo obligatorio', invalid_type_error: 'Campo obligatorio' }

const clave = z
  .string(requerido)
  .min(CLAVE_MIN, `La clave debe tener al menos ${CLAVE_MIN} caracteres`)
  .max(200)
  .regex(/[a-záéíóúñ]/i, 'La clave debe incluir alguna letra')
  .regex(/[0-9]/, 'La clave debe incluir algún número')

export const loginSchema = z.object({
  email: z.string(requerido).trim().toLowerCase().email('Correo no válido').max(160),
  password: z.string(requerido).min(1, 'Campo obligatorio').max(200),
})

export const cambiarClaveSchema = z.object({
  actual: z.string(requerido).min(1, 'Campo obligatorio').max(200),
  nueva: clave,
})

export const crearUsuarioSchema = z.object({
  email: z.string(requerido).trim().toLowerCase().email('Correo no válido').max(160),
  name: z.string(requerido).trim().min(1, 'Campo obligatorio').max(160),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Rol no válido' }) }),
  password: clave,
})

export const editarUsuarioSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().toLowerCase().email('Correo no válido').max(160).optional(),
  role: z.enum(ROLES, { errorMap: () => ({ message: 'Rol no válido' }) }).optional(),
  active: z.boolean().optional(),
})
