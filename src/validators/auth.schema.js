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

/**
 * `role` y `roles` no pueden contar historias distintas.
 *
 * Una cuenta guarda los dos campos: `roles[]`, que es el bueno, y `role`, que
 * es el que había antes de que una cuenta pudiera tener varios. El validador
 * los aceptaba por separado, así que este cuerpo era válido:
 *
 *     { role: 'ADMIN', roles: ['LECTURA'] }
 *
 * y el controlador lo guardaba tal cual. Salía una cuenta que para la matriz
 * de permisos era de solo lectura —no podía hacer nada— y para las vistas era
 * administradora: veía el tamizaje completo de todo el mundo, con la pregunta
 * de si la persona ha tenido pensamientos de hacerse daño incluida.
 *
 * Las lecturas ya están arregladas y todas pasan por `puede()`. Esto cierra la
 * puerta por la que se entraba: si mandas los dos campos, tienen que concordar.
 */
const rolPrincipalCoherente = (d) => !d.role || !d.roles || d.roles.includes(d.role)
const mensajeIncoherente = {
  message: 'El rol principal tiene que estar entre los roles asignados',
  path: ['role'],
}

export const crearUsuarioSchema = z
  .object({
    email: z.string(requerido).trim().toLowerCase().email('Correo no válido').max(160),
    name: z.string(requerido).trim().min(1, 'Campo obligatorio').max(160),
    role: z.enum(ROLES, { errorMap: () => ({ message: 'Rol no válido' }) }).optional(),
    roles: z.array(z.enum(ROLES, { errorMap: () => ({ message: 'Rol no válido' }) })).min(1, 'Debes seleccionar al menos un rol').optional(),
    password: clave,
  })
  .refine(rolPrincipalCoherente, mensajeIncoherente)

export const editarUsuarioSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().toLowerCase().email('Correo no válido').max(160).optional(),
    role: z.enum(ROLES, { errorMap: () => ({ message: 'Rol no válido' }) }).optional(),
    roles: z.array(z.enum(ROLES, { errorMap: () => ({ message: 'Rol no válido' }) })).min(1, 'Debes seleccionar al menos un rol').optional(),
    active: z.boolean().optional(),
  })
  .refine(rolPrincipalCoherente, mensajeIncoherente)
