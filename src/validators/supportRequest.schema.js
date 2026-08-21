import { z } from 'zod'
import { VERSIONES_VALIDAS } from '../consent/versions.js'
import { WEEKDAYS, DAY_SLOTS } from './volunteer.schema.js'

const required = { required_error: 'Campo obligatorio', invalid_type_error: 'Campo obligatorio' }

const trimmed = (max) => z.string(required).trim().min(1, 'Campo obligatorio').max(max)
const opcional = (max) => z.string().trim().max(max).optional().or(z.literal(''))

const choice = (values) =>
  z.enum(values, { errorMap: () => ({ message: 'Selecciona una opción' }) })

const consentimiento = (mensaje) =>
  z.literal(true, { errorMap: () => ({ message: mensaje }) })

export const supportRequestCreateSchema = z
  .object({
    // --- Bloque 1: para quién es ---
    forWhom: choice(['PARA_MI', 'PARA_OTRA_PERSONA']),
    isMinor: z.boolean().optional().nullable(),
    relationship: opcional(120),
    contactName: opcional(160),

    // --- Bloque 2: contacto ---
    name: trimmed(160),
    phone: trimmed(40).regex(/^[0-9+()\s-]{7,40}$/, 'Número de teléfono no válido'),
    // El correo es opcional a propósito: el celular basta.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Correo no válido')
      .max(160)
      .optional()
      .or(z.literal('')),
    preferredContact: choice(['WHATSAPP', 'LLAMADA', 'CORREO']),
    city: trimmed(160),

    // --- Bloque 3: cuándo y cómo ---
    // El formulario público ya no pregunta cuándo le viene bien: la red
    // decidió acordarlo en la primera llamada, no en el registro. Se siguen
    // aceptando por si llegan (envíos viejos, cargas), pero un select vacío
    // ('') cuenta como "no se preguntó", no como valor inválido.
    preferredModality: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.enum(['PRESENCIAL', 'VIRTUAL', 'INDIFERENTE']).optional(),
    ),
    availableDays: z.array(z.enum(WEEKDAYS)).optional().default([]),
    availableSlots: z.array(z.enum(DAY_SLOTS)).optional().default([]),
    message: opcional(1000),

    // --- Bloque 4: autorizaciones ---
    consentVersion: z.enum(VERSIONES_VALIDAS, {
      errorMap: () => ({ message: 'Versión de autorización no reconocida' }),
    }),
    dataConsent: consentimiento('Necesitamos tu autorización para poder contactarte'),
    sensitiveDataConsent: consentimiento(
      'Necesitamos tu autorización expresa para poder ofrecerte acompañamiento',
    ),
    guardianConsent: z.boolean().optional().default(false),
    communicationsConsent: z.boolean().optional().default(false),
  })
  // Si eligió "Correo" como canal preferido, entonces sí hace falta un correo.
  .refine((d) => d.preferredContact !== 'CORREO' || Boolean(d.email), {
    message: 'Si prefieres que te escribamos por correo, necesitamos tu dirección',
    path: ['email'],
  })
  // Si es para otra persona, hay que saber si es menor de edad.
  .refine((d) => d.forWhom !== 'PARA_OTRA_PERSONA' || typeof d.isMinor === 'boolean', {
    message: 'Cuéntanos si esa persona es menor de 18 años',
    path: ['isMinor'],
  })
  // Y quién llena el formulario, para no llamar a la persona equivocada.
  .refine((d) => d.forWhom !== 'PARA_OTRA_PERSONA' || Boolean(d.contactName?.trim()), {
    message: 'Dinos tu nombre, para saber con quién hablamos',
    path: ['contactName'],
  })
  // Si la persona acompañada es menor de edad, la autorización la da quien
  // ejerce la patria potestad. Sin esa casilla no se puede continuar.
  .refine((d) => d.isMinor !== true || d.guardianConsent === true, {
    message: 'Como es para un menor de edad, necesitamos la autorización de su representante legal',
    path: ['guardianConsent'],
  })
