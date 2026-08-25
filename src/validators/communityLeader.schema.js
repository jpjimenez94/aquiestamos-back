import { z } from 'zod'

const requerido = { required_error: 'Campo obligatorio', invalid_type_error: 'Campo obligatorio' }

export const crearLiderSchema = z.object({
  name: z.string(requerido).trim().min(1, 'El nombre es obligatorio').max(160),
  phone: z.string(requerido).trim().min(5, 'Teléfono no válido').max(40),
  email: z.string().trim().toLowerCase().email('Correo no válido').max(160).optional().or(z.literal('')),
  territory: z.string(requerido).trim().min(1, 'El territorio/comunidad es obligatorio').max(200),
  beneficiariesCount: z.number().int().min(0).default(0),
  status: z.enum(['ACTIVO', 'EN_SEGUIMIENTO', 'ATENDIDO', 'INACTIVO']).default('ACTIVO'),
  nextAction: z.string().trim().max(600).optional().or(z.literal('')),
  nextActionDate: z.string().datetime({ offset: true }).optional().or(z.literal('')).or(z.null()),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  needIds: z.array(z.string().uuid()).default([]),
})

export const editarLiderSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().min(5).max(40).optional(),
  email: z.string().trim().toLowerCase().email('Correo no válido').max(160).optional().or(z.literal('')).or(z.null()),
  territory: z.string().trim().min(1).max(200).optional(),
  beneficiariesCount: z.number().int().min(0).optional(),
  status: z.enum(['ACTIVO', 'EN_SEGUIMIENTO', 'ATENDIDO', 'INACTIVO']).optional(),
  nextAction: z.string().trim().max(600).optional().or(z.literal('')).or(z.null()),
  nextActionDate: z.string().datetime({ offset: true }).optional().or(z.literal('')).or(z.null()),
  notes: z.string().trim().max(2000).optional().or(z.literal('')).or(z.null()),
  needIds: z.array(z.string().uuid()).optional(),
})

export const registrarContactoSchema = z.object({
  notes: z.string(requerido).trim().min(1, 'El detalle del contacto es obligatorio').max(2000),
  nextActionDefined: z.string().trim().max(600).optional().or(z.literal('')),
  nextActionDate: z.string().datetime({ offset: true }).optional().or(z.literal('')).or(z.null()),
  status: z.enum(['ACTIVO', 'EN_SEGUIMIENTO', 'ATENDIDO', 'INACTIVO']).optional(),
})

export const crearCategoriaNecesidadSchema = z.object({
  type: z.enum(['PSICOLOGICA', 'RECURSO'], { errorMap: () => ({ message: 'Tipo no válido' }) }),
  name: z.string(requerido).trim().min(1, 'El nombre es obligatorio').max(160),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  active: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
})

export const editarCategoriaNecesidadSchema = z.object({
  type: z.enum(['PSICOLOGICA', 'RECURSO']).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(300).optional().or(z.literal('')).or(z.null()),
  active: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
})
