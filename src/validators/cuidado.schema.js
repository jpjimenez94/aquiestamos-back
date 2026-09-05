import { z } from 'zod'

/**
 * Lo que entra al módulo «Cuidado del equipo». Regla 6 del MAPA: toda
 * entrada pasa por un schema Zod.
 */

export const NECESIDADES = ['APOYO_PARA_MI', 'AYUDA_CON_UN_CASO', 'DESCARGARME']

/** «¿Cómo estás tú?»: lo que llena el profesional desde su enlace. */
export const checkInSchema = z.object({
  need: z.enum(NECESIDADES, {
    errorMap: () => ({ message: 'Dinos qué necesitas: apoyo para ti, ayuda con un caso, o descargarte' }),
  }),
  notes: z.string().trim().max(1000, 'Máximo 1000 caracteres').optional().nullable(),
  questionForGroup: z.string().trim().max(600, 'Máximo 600 caracteres').optional().nullable(),
})

/** Ofrecerse —o dejar de ofrecerse— como supervisor. */
export const supervisorSchema = z.object({
  disponible: z.boolean({ required_error: 'Falta decir si te ofreces o no' }),
})

/** Coordinación convoca una sesión grupal. */
export const convocarSesionSchema = z.object({
  facilitatorId: z.string().uuid('El facilitador no es válido'),
  startsAt: z.string().datetime({ offset: true, message: 'La fecha y hora no son válidas' }),
  duracionMinutos: z.number().int().min(30).max(180).default(60),
  meetingUrl: z
    .string()
    .trim()
    .url('El enlace de la reunión no es válido')
    .max(500),
  invitados: z
    .array(z.string().uuid())
    .min(1, 'Invita al menos a una persona')
    .max(30, 'Máximo 30 invitados por sesión'),
  /** Si viene vacía, se arma sola con las preguntas de los invitados. */
  agenda: z.string().trim().max(4000, 'Máximo 4000 caracteres').optional().nullable(),
})

/** Cerrar una sesión: se hizo, o se canceló. */
export const estadoSesionSchema = z.object({
  estado: z.enum(['REALIZADA', 'CANCELADA'], {
    errorMap: () => ({ message: 'Una sesión se marca como realizada o cancelada' }),
  }),
})

/** Marcar quién asistió, después de la sesión. */
export const asistenciaSchema = z.object({
  asistieron: z.array(z.string().uuid()).max(30),
})
