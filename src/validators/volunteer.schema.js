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

/**
 * La vacuna solo se le pregunta a quien puede ir presencial. A los demás el
 * formulario les manda '' (React inicializa los selects vacíos), que no es lo
 * mismo que un valor inválido: es "no se preguntó".
 */
const choiceOpcional = (values) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.enum(values, { errorMap: () => ({ message: 'Selecciona una opción' }) }).optional(),
  )

const consentimiento = (mensaje) =>
  z.literal(true, { errorMap: () => ({ message: mensaje }) })

export const volunteerCreateSchema = z
  .object({
    // --- Bloque 1 ---
    fullName: trimmed(160),
    // Acepta un celular colombiano tal como se marca aquí (3001234567) y
    // cualquiera de otro país con su indicativo (+34 600 123 456). El `+`
    // solo vale al principio: en medio del número no significa nada.
    phone: trimmed(40).regex(/^\+?[\d\s()-]{7,25}$/, 'Número de celular no válido'),
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
    modality: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']),
    availableToTravel: opcional(200),
    availableDays: z.array(z.enum(WEEKDAYS), required).min(1, 'Selecciona al menos un día'),
    availableSlots: z.array(z.enum(DAY_SLOTS), required).min(1, 'Selecciona al menos una franja'),
    weeklyHours: choice(['ENTRE_1_Y_3', 'ENTRE_4_Y_6', 'MAS_DE_6', 'VARIABLE']),
    yellowFeverVaccine: choiceOpcional(['SI', 'NO', 'CITA_AGENDADA']),

    // --- Bloque 4 ---
    consentVersion: z.enum(VERSIONES_VALIDAS, {
      errorMap: () => ({ message: 'Versión de autorización no reconocida' }),
    }),
    dataConsent: consentimiento('Necesitamos tu autorización para poder contactarte'),
    sensitiveDataConsent: z.boolean().optional().default(false),
    communicationsConsent: z.boolean().optional().default(false),

    // --- Documentos opcionales (habilitación profesional e identidad) ---
    professionalCardDocumentUrl: z.string().trim().max(500).optional().or(z.literal('')),
    identityDocumentUrl: z.string().trim().max(500).optional().or(z.literal('')),
    identityDocumentBackUrl: z.string().trim().max(500).optional().or(z.literal('')),
    professionalCardNumber: z.string().trim().max(60).optional().or(z.literal('')),
  })
  // Si marcó "Otra" población, hay que decir cuál.
  .refine(
    (d) => !d.populations.includes('Otra') || Boolean(d.populationOther?.trim()),
    { message: 'Cuéntanos con qué otra población trabajas', path: ['populationOther'] },
  )
  // La vacuna solo se pregunta a quien puede ir de forma presencial, pero si se
  // pregunta, es obligatoria.
  .refine(
    (d) => d.modality === 'VIRTUAL' || Boolean(d.yellowFeverVaccine),
    { message: 'Selecciona una opción', path: ['yellowFeverVaccine'] },
  )
  // El estado de vacunación es un dato de salud. La Ley 1581 pide autorización
  // expresa y aparte para tratarlo; no basta con el consentimiento general.
  .refine(
    (d) => !d.yellowFeverVaccine || d.sensitiveDataConsent === true,
    {
      message: 'Necesitamos tu autorización expresa para guardar el dato de vacunación',
      path: ['sensitiveDataConsent'],
    },
  )
