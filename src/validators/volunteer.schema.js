import { z } from 'zod'
import { VERSIONES_VALIDAS } from '../consent/versions.js'

export const POPULATION_OPTIONS = [
  'Niños y niñas',
  'Adolescentes',
  'Jóvenes',
  'Adultos',
  'Personas mayores',
  'Familias',
  'Enfoque de género',
  'Población víctima de violencia',
  'Población desplazada/migrante',
  'Otra',
]

export const WEEKDAYS = [
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
  'DOMINGO',
]

export const DAY_SLOTS = ['MANANA', 'TARDE', 'NOCHE']

const required = { required_error: 'Campo obligatorio', invalid_type_error: 'Campo obligatorio' }

const trimmed = (max) => z.string(required).trim().min(1, 'Campo obligatorio').max(max)
const opcional = (max) => z.string().trim().max(max).optional().or(z.literal(''))

const choice = (values) =>
  z.enum(values, { errorMap: () => ({ message: 'Selecciona una opción' }) })

const consentimiento = (mensaje) =>
  z.literal(true, { errorMap: () => ({ message: mensaje }) })

export const volunteerCreateSchema = z
  .object({
    // --- Bloque 1 ---
    fullName: trimmed(160),
    phone: trimmed(40).regex(/^[0-9+()\s-]{7,40}$/, 'Número de celular no válido'),
    email: z.string(required).trim().toLowerCase().email('Correo no válido').max(160),
    city: trimmed(160),

    // --- Bloque 2 ---
    profession: trimmed(160),
    additionalTraining: opcional(400),
    yearsExperience: choice(['MENOS_DE_1', 'ENTRE_1_Y_3', 'ENTRE_3_Y_5', 'MAS_DE_5']),
    professionalCard: choice(['SI', 'EN_TRAMITE', 'ESTUDIANTE']),
    populations: z
      .array(z.enum(POPULATION_OPTIONS), required)
      .min(1, 'Selecciona al menos una población'),
    populationOther: opcional(200),
    crisisExperience: choice([
      'SI',
      'NO',
      'FORMACION_POCA_PRACTICA',
      'SIN_FORMACION_DISPONIBLE_APRENDER',
    ]),

    // --- Bloque 3 ---
    modality: z.enum(['PRESENCIAL', 'VIRTUAL', 'AMBAS']).optional().nullable(),
    availableToTravel: opcional(200),
    availableDays: z.array(z.enum(WEEKDAYS)).optional().default([]),
    availableSlots: z.array(z.enum(DAY_SLOTS)).optional().default([]),
    weeklyHours: z.enum(['ENTRE_1_Y_3', 'ENTRE_4_Y_6', 'MAS_DE_6', 'VARIABLE']).optional().nullable(),
    yellowFeverVaccine: z.enum(['SI', 'NO', 'CITA_AGENDADA']).optional().nullable(),

    // --- Bloque 4 ---
    consentVersion: z.enum(VERSIONES_VALIDAS, {
      errorMap: () => ({ message: 'Versión de autorización no reconocida' }),
    }),
    dataConsent: consentimiento('Necesitamos tu autorización para poder contactarte'),
    sensitiveDataConsent: z.boolean().optional().default(false),
    communicationsConsent: z.boolean().optional().default(false),
  })
  // Si marcó "Otra" población, hay que decir cuál.
  .refine(
    (d) => !d.populations.includes('Otra') || Boolean(d.populationOther?.trim()),
    { message: 'Cuéntanos con qué otra población trabajas', path: ['populationOther'] },
  )
