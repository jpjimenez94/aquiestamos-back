import { z } from 'zod'

const AREAS = ['SALUD', 'SOCIAL_LEGAL_EDUCATIVO', 'OPERACION_LOGISTICA', 'COMUNICACION_TECNOLOGIA', 'GESTION_PROYECTOS', 'OTRA']
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA']
const ESTADOS_TAREA = ['BORRADOR', 'ABIERTA', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA']
const ESTADOS_ASIGNACION = ['EN_PROGRESO', 'COMPLETADO', 'NO_RESPONDIO']

export const taskCreateSchema = z.object({
  area: z.enum(AREAS),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  priority: z.enum(PRIORIDADES).default('MEDIA'),
  notes: z.string().max(2000).optional().nullable(),
})

export const taskUpdateSchema = taskCreateSchema.partial()

export const taskStatusSchema = z.object({
  status: z.enum(ESTADOS_TAREA),
})

export const assignCollaboratorSchema = z.object({
  collaboratorId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
})

export const updateAssignmentStatusSchema = z.object({
  status: z.enum(ESTADOS_ASIGNACION),
})

// Ruta pública: el voluntario acepta o rechaza
export const taskConfirmationSchema = z.object({
  accion: z.enum(['ACEPTAR', 'RECHAZAR']),
  declineReason: z.string().max(300).optional(),
})
