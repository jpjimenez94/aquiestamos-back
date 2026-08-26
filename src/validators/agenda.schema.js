import { z } from 'zod'
import { WEEKDAYS } from './volunteer.schema.js'

const requerido = { required_error: 'Campo obligatorio', invalid_type_error: 'Campo obligatorio' }
const choice = (values) => z.enum(values, { errorMap: () => ({ message: 'Selecciona una opcion' }) })

/** Fecha ISO que llega como texto y sale como Date. */
const fecha = z
  .string(requerido)
  .datetime({ offset: true, message: 'Fecha no valida (se espera formato ISO)' })
  .transform((v) => new Date(v))

export const crearCitaSchema = z
  .object({
    professionalId: z.string(requerido).uuid('Identificador no valido'),
    patientId: z.string(requerido).uuid('Identificador no valido'),
    inicio: fecha,
    fin: fecha,
    modalidad: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']).optional(),
    estado: choice(['PROGRAMADA', 'CONFIRMADA']).optional(),
    fueraDeFranja: z.boolean().optional(),
    meetingUrl: z.string().max(500).optional().nullable().or(z.literal('')),
    meetingProvider: z.string().max(50).optional().nullable(),
  })
  .refine((d) => d.fin > d.inicio, {
    message: 'La hora de fin debe ser posterior a la de inicio',
    path: ['fin'],
  })

export const cambiarEstadoSchema = z.object({
  estado: choice(['CONFIRMADA', 'REALIZADA', 'CANCELADA', 'NO_ASISTIO']),
  motivo: z.string().trim().max(300).optional().or(z.literal('')),
})

export const reprogramarSchema = z
  .object({
    inicio: fecha,
    fin: fecha,
    modalidad: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']).optional(),
    meetingUrl: z.string().max(500).optional().nullable().or(z.literal('')),
    meetingProvider: z.string().max(50).optional().nullable(),
  })
  .refine((d) => d.fin > d.inicio, {
    message: 'La hora de fin debe ser posterior a la de inicio',
    path: ['fin'],
  })

export const asignarCasoSchema = z.object({
  professionalId: z.string(requerido).uuid('Identificador no valido'),
  patientId: z.string(requerido).uuid('Identificador no valido'),
})

export const cerrarCasoSchema = z.object({
  motivo: z.string().trim().min(1, 'Cuentanos por que se cierra').max(300),
})

const franjaSchema = z
  .object({
    weekday: choice(WEEKDAYS),
    startMinute: z.number(requerido).int().min(0).max(1440),
    endMinute: z.number(requerido).int().min(0).max(1440),
    modality: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']).optional().default('AMBAS'),
  })
  .refine((f) => f.endMinute - f.startMinute >= 45, {
    message: 'Cada franja debe durar al menos 45 minutos, que es lo que dura una sesion',
    path: ['endMinute'],
  })

export const reemplazarFranjasSchema = z.object({
  franjas: z.array(franjaSchema).max(60),
})

export const crearBloqueoSchema = z
  .object({
    inicio: fecha,
    fin: fecha,
    motivo: z.string().trim().max(200).optional().or(z.literal('')),
  })
  .refine((d) => d.fin > d.inicio, {
    message: 'La fecha final debe ser posterior a la inicial',
    path: ['fin'],
  })

export const aprobarPostulacionSchema = z.object({
  city: z.string().trim().max(160).optional(),
  profession: z.string().trim().max(160).optional(),
  maxActiveCases: z.number().int().min(0).max(50).optional(),
  status: choice(['PENDIENTE_VALIDACION', 'ACTIVO']).optional(),
  // Quien aprueba completa la modalidad cuando la postulación no la traía.
  modality: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']).optional(),
})

/**
 * Admitir una solicitud. La prioridad es obligatoria a propósito: si tuviera
 * valor por defecto, en la práctica todo quedaría en "media" y el campo
 * dejaría de servir para ordenar la cola, que es para lo que existe.
 */
export const admitirSolicitudSchema = z.object({
  priority: choice(['BAJA', 'MEDIA', 'ALTA']),
  city: z.string().trim().max(160).optional(),
})

export const actualizarTarjetaProfesionalSchema = z.object({
  professionalCardNumber: z.string().trim().max(60).optional().or(z.literal('')),
  professionalCardDocumentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  professionalCardVerified: z.boolean().optional(),
})

export const actualizarConsentimientoSchema = z.object({
  consentSigned: z.boolean(),
  consentSignedDocumentUrl: z.string().trim().max(500).optional().or(z.literal('')),
})

export const editarProfesionalSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().toLowerCase().email('Correo no valido').max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(160).optional(),
  profession: z.string().trim().max(160).optional(),
  professionalCardNumber: z.string().trim().max(60).optional().or(z.literal('')),
  professionalCardDocumentUrl: z.string().trim().max(500).optional().or(z.literal('')),
  professionalCardVerified: z.boolean().optional(),
  populations: z.array(z.string().max(80)).max(20).optional(),
  modality: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']).optional(),
  travelsTo: z.string().trim().max(200).optional().or(z.literal('')),
  status: choice(['PENDIENTE_VALIDACION', 'ACTIVO', 'PAUSADO', 'INACTIVO']).optional(),
  maxActiveCases: z.number().int().min(0).max(50).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  /// Cuenta del portal con la que este profesional entra a ver su agenda.
  /// `null` desvincula.
  userId: z.string().uuid('Identificador no valido').nullable().optional(),
})

export const editarPacienteSchema = z.object({
  priority: choice(['BAJA', 'MEDIA', 'ALTA']).optional(),
  fullName: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().toLowerCase().email('Correo no valido').max(160).optional().or(z.literal('')),
  city: z.string().trim().max(160).optional(),
  preferredModality: choice(['PRESENCIAL', 'VIRTUAL', 'INDIFERENTE']).optional(),
  availableDays: z.array(z.enum(WEEKDAYS)).max(7).optional(),
  availableSlots: z.array(z.enum(['MANANA', 'TARDE', 'NOCHE'])).max(3).optional(),
  status: choice(['NUEVO', 'EN_ADMISION', 'ASIGNADO', 'EN_ACOMPANAMIENTO', 'CERRADO']).optional(),
})

/**
 * Cuadrar el horario que la persona acompañada eligió.
 *
 * `fueraDeFranja` es un sí explícito de quien coordina a agendar en un rato
 * que el profesional no tiene declarado. No es un valor por defecto ni algo
 * que el portal marque solo: el profesional aceptó ESE horario desde su
 * enlace, y su palabra de hoy vale más que las franjas que cargó hace un mes.
 * Queda en la auditoría.
 */
export const confirmarHorarioSchema = z.object({
  inicio: z.coerce.date({ errorMap: () => ({ message: 'Esa fecha no es válida' }) }),
  fin: z.coerce.date({ errorMap: () => ({ message: 'Esa fecha no es válida' }) }),
  modalidad: z.enum(['PRESENCIAL', 'VIRTUAL']).optional(),
  meetingUrl: urlOpt,
  meetingProvider: z.string().trim().max(40).optional(),
  fueraDeFranja: z.boolean().optional().default(false),
})

export const cancelarAsignacionSchema = z.object({
  motivo: z
    .string({ required_error: 'Cuéntanos por qué no se pudo cuadrar' })
    .trim()
    .min(3, 'Cuéntanos por qué no se pudo cuadrar')
    .max(300),
})
