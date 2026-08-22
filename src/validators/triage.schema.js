import { z } from 'zod'
import { VERSION_ACTUAL } from '../consent/versions.js'

/**
 * Las siete preguntas del tamizaje.
 *
 * Ninguna es opcional: la prioridad sale de cruzarlas, y una respuesta a medias
 * daría una prioridad a medias sin que nada avisara. Lo que sí puede hacer la
 * persona es no abrir el enlace; eso es distinto y el portal lo muestra como
 * "sin responder".
 */

const GRADO = ['SI', 'MAS_O_MENOS', 'NO']
const CAPACIDAD = ['SI', 'CON_DIFICULTAD', 'NO']
const URGENCIA = ['HOY', 'ESTA_SEMANA', 'PUEDO_ESPERAR']
const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
const FRANJAS = ['MANANA', 'TARDE', 'NOCHE']
const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'INDIFERENTE']

const faltaResponder = { errorMap: () => ({ message: 'Falta responder esta pregunta' }) }

const siONo = z.boolean({
  required_error: 'Falta responder esta pregunta',
  invalid_type_error: 'Falta responder esta pregunta',
})

export const triageResponseSchema = z.object({
  safePlace: siONo,
  distress: z.coerce
    .number({ ...faltaResponder })
    .int('Elige un número del 1 al 5')
    .min(1, 'Elige un número del 1 al 5')
    .max(5, 'Elige un número del 1 al 5'),
  sleepAndEat: z.enum(GRADO, faltaResponder),
  dailyFunction: z.enum(CAPACIDAD, faltaResponder),
  hasSupport: siONo,
  selfHarmThoughts: siONo,
  howSoon: z.enum(URGENCIA, faltaResponder),

  /**
   * Cuándo puede y cómo lo prefiere.
   *
   * Obligatorias como el resto: son el dato que decide si a un profesional se
   * le puede proponer este caso, y preguntarlas "por si acaso" es exactamente
   * lo que se hizo en el formulario público —donde son opcionales— con el
   * resultado de que no las llenó nadie.
   */
  availableDays: z
    .array(z.enum(DIAS))
    .min(1, 'Marca al menos un día en el que podrías'),
  availableSlots: z
    .array(z.enum(FRANJAS))
    .min(1, 'Marca al menos una hora que te sirva'),
  preferredModality: z.enum(MODALIDADES, faltaResponder),

  /**
   * Esto es dato de salud y va con su propia autorización, aparte de la que
   * dio al mandar la solicitud. `literal(true)` y no `boolean()`: un `false`
   * tiene que fallar, no guardarse.
   */
  sensitiveDataConsent: z.literal(true, {
    errorMap: () => ({ message: 'Necesitamos tu autorización para poder usar estas respuestas' }),
  }),
  consentVersion: z.string().trim().max(20).optional().default(VERSION_ACTUAL),
})

export const OPCIONES = { GRADO, CAPACIDAD, URGENCIA, DIAS, FRANJAS, MODALIDADES }
