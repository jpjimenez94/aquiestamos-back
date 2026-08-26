import { z } from 'zod'
import { VERSIONES_VALIDAS } from '../consent/versions.js'
import { WEEKDAYS, DAY_SLOTS } from './volunteer.schema.js'

/**
 * Catálogo de disciplinas del voluntariado de apoyo.
 *
 * Vive aquí y no como enum de PostgreSQL para que la red pueda añadir una
 * disciplina sin migrar la base. El área sí es enum: es con lo que se filtra
 * el directorio y son cinco grupos que no cambian.
 *
 * "Otra" está en todas las áreas a propósito: nadie debería quedarse fuera
 * del registro por no encontrar su oficio en una lista.
 */
export const DISCIPLINAS = {
  SALUD: [
    'Medicina',
    'Enfermería',
    'Fisioterapia',
    'Terapia ocupacional',
    'Fonoaudiología',
    'Nutrición y dietética',
    'Odontología',
    'Primeros auxilios',
    'Otra',
  ],
  SOCIAL_LEGAL_EDUCATIVO: [
    'Trabajo social',
    'Derecho',
    'Docencia',
    'Pedagogía',
    'Primera infancia',
    'Gestión comunitaria',
    'Otra',
  ],
  OPERACION_LOGISTICA: [
    'Logística',
    'Transporte y conducción',
    'Bodega e inventario',
    'Cocina y alimentación',
    'Construcción y obra',
    'Gestión del riesgo de desastres',
    'Otra',
  ],
  COMUNICACION_TECNOLOGIA: [
    'Comunicación social',
    'Diseño',
    'Sistemas y tecnología',
    'Análisis de datos',
    'Traducción e interpretación',
    'Otra',
  ],
  GESTION_PROYECTOS: [
    'Gerencia de proyectos',
    'Administración',
    'Finanzas y contabilidad',
    'Talento humano',
    'Otra',
  ],
  OTRA: ['Otra'],
}

export const AREAS = Object.keys(DISCIPLINAS)

const required = { required_error: 'Campo obligatorio', invalid_type_error: 'Campo obligatorio' }

const trimmed = (max) => z.string(required).trim().min(1, 'Campo obligatorio').max(max)
const opcional = (max) => z.string().trim().max(max).optional().or(z.literal(''))

const choice = (values) =>
  z.enum(values, { errorMap: () => ({ message: 'Selecciona una opción' }) })

/** Igual que en el formulario de profesionales: '' es "no se preguntó". */
const choiceOpcional = (values) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.enum(values, { errorMap: () => ({ message: 'Selecciona una opción' }) }).optional(),
  )

const consentimiento = (mensaje) =>
  z.literal(true, { errorMap: () => ({ message: mensaje }) })

export const collaboratorCreateSchema = z
  .object({
    // --- Bloque 1: contacto ---
    fullName: trimmed(160),
    // Acepta un celular colombiano tal como se marca aquí (3001234567) y
    // cualquiera de otro país con su indicativo (+34 600 123 456). El `+`
    // solo vale al principio: en medio del número no significa nada.
    phone: trimmed(40).regex(/^\+?[\d\s()-]{7,25}$/, 'Número de celular no válido'),
    email: z.string(required).trim().toLowerCase().email('Correo no válido').max(160),
    city: trimmed(160),

    // --- Bloque 2: qué sabe hacer ---
    area: choice(AREAS),
    discipline: trimmed(120),
    disciplineOther: opcional(160),
    yearsExperience: choiceOpcional(['MENOS_DE_1', 'ENTRE_1_Y_3', 'ENTRE_3_Y_5', 'MAS_DE_5']),
    professionalCard: choiceOpcional(['SI', 'EN_TRAMITE', 'ESTUDIANTE']),
    skills: opcional(600),

    // --- Bloque 3: disponibilidad ---
    modality: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']),
    availableToTravel: opcional(200),
    availableDays: z.array(z.enum(WEEKDAYS), required).min(1, 'Selecciona al menos un día'),
    availableSlots: z.array(z.enum(DAY_SLOTS), required).min(1, 'Selecciona al menos una franja'),
    weeklyHours: choice(['ENTRE_1_Y_3', 'ENTRE_4_Y_6', 'MAS_DE_6', 'VARIABLE']),
    yellowFeverVaccine: choiceOpcional(['SI', 'NO', 'CITA_AGENDADA']),

    // --- Bloque 4: autorizaciones ---
    consentVersion: z.enum(VERSIONES_VALIDAS, {
      errorMap: () => ({ message: 'Versión de autorización no reconocida' }),
    }),
    dataConsent: consentimiento('Necesitamos tu autorización para poder contactarte'),
    sensitiveDataConsent: z.boolean().optional().default(false),
    communicationsConsent: z.boolean().optional().default(false),
  })
  // La disciplina tiene que pertenecer al área elegida. Sin esto, un envío
  // hecho a mano podría guardar "Cocina" dentro de "Salud" y el directorio
  // dejaría de servir justo para lo que existe: buscar por área.
  .refine((d) => DISCIPLINAS[d.area]?.includes(d.discipline), {
    message: 'Esa disciplina no corresponde al área elegida',
    path: ['discipline'],
  })
  // Si eligió "Otra", hay que decir cuál: si no, el registro es un nombre y
  // un teléfono sin nada que permita decidir a quién llamar.
  .refine((d) => d.discipline !== 'Otra' || Boolean(d.disciplineOther?.trim()), {
    message: 'Cuéntanos cuál es tu disciplina',
    path: ['disciplineOther'],
  })
  // La vacuna solo se pregunta a quien puede ir presencial, pero si se
  // pregunta, es obligatoria.
  .refine((d) => d.modality === 'VIRTUAL' || Boolean(d.yellowFeverVaccine), {
    message: 'Selecciona una opción',
    path: ['yellowFeverVaccine'],
  })
  // El estado de vacunación es un dato de salud: la Ley 1581 pide
  // autorización expresa y aparte para tratarlo.
  .refine((d) => !d.yellowFeverVaccine || d.sensitiveDataConsent === true, {
    message: 'Necesitamos tu autorización expresa para guardar el dato de vacunación',
    path: ['sensitiveDataConsent'],
  })


export const collaboratorUpdateSchema = z.object({
  fullName: trimmed(160).optional(),
  phone: trimmed(40).regex(/^\+?[\d\s()-]{7,25}$/, 'Número de celular no válido').optional(),
  email: z.string().trim().toLowerCase().email('Correo no válido').max(160).optional(),
  city: trimmed(160).optional(),
  area: choice(AREAS).optional(),
  discipline: trimmed(120).optional(),
  disciplineOther: opcional(160),
  yearsExperience: choiceOpcional(['MENOS_DE_1', 'ENTRE_1_Y_3', 'ENTRE_3_Y_5', 'MAS_DE_5']),
  professionalCard: choiceOpcional(['SI', 'EN_TRAMITE', 'ESTUDIANTE']),
  skills: opcional(600),
  modality: choice(['PRESENCIAL', 'VIRTUAL', 'AMBAS']).optional(),
  availableToTravel: opcional(200),
  availableDays: z.array(z.enum(WEEKDAYS)).optional(),
  availableSlots: z.array(z.enum(DAY_SLOTS)).optional(),
  weeklyHours: choice(['ENTRE_1_Y_3', 'ENTRE_4_Y_6', 'MAS_DE_6', 'VARIABLE']).optional(),
  status: choice(['NUEVO', 'ACTIVO', 'INACTIVO']).optional(),
})
