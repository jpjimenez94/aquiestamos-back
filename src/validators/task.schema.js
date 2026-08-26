import { z } from 'zod'

const AREAS = ['SALUD', 'SOCIAL_LEGAL_EDUCATIVO', 'OPERACION_LOGISTICA', 'COMUNICACION_TECNOLOGIA', 'GESTION_PROYECTOS', 'OTRA']
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA']
const ESTADOS_TAREA = ['BORRADOR', 'ABIERTA', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA']
const ESTADOS_ASIGNACION = ['INVITADO', 'ACEPTADO', 'RECHAZADO', 'EN_PROGRESO', 'COMPLETADO', 'NO_RESPONDIO']

export const taskCreateSchema = z.object({
  area: z.enum(AREAS),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  priority: z.enum(PRIORIDADES).default('MEDIA'),
  materialsUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  notes: z.string().max(2000).optional().nullable(),
  collaboratorId: z.string().uuid().optional().nullable(),
  assignmentNote: z.string().max(500).optional().nullable(),
})

export const taskUpdateSchema = z.object({
  area: z.enum(AREAS).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  priority: z.enum(PRIORIDADES).optional(),
  materialsUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  notes: z.string().max(2000).optional().nullable(),
})

export const taskStatusSchema = z.object({
  status: z.enum(ESTADOS_TAREA),
})

export const assignCollaboratorSchema = z.object({
  collaboratorId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
})

export const reassignCollaboratorSchema = z.object({
  newCollaboratorId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
})

export const addNoteSchema = z.object({
  note: z.string().min(1).max(1000),
})

export const updateAssignmentStatusSchema = z.object({
  status: z.enum(ESTADOS_ASIGNACION),
})

// Ruta pública: el voluntario acepta o rechaza
export const taskConfirmationSchema = z.object({
  accion: z.enum(['ACEPTAR', 'RECHAZAR']),
  declineReason: z.string().max(300).optional(),
})

// Ruta pública: el voluntario marca como completada y entrega recursos
export const taskCompletionSchema = z.object({
  completionUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  completionNote: z.string().max(1000).optional().nullable(),
})
