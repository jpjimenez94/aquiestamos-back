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
   * Esto es dato de salud y va con su propia autorización, aparte de la que
   * dio al mandar la solicitud. `literal(true)` y no `boolean()`: un `false`
   * tiene que fallar, no guardarse.
   */
  sensitiveDataConsent: z.literal(true, {
    errorMap: () => ({ message: 'Necesitamos tu autorización para poder usar estas respuestas' }),
  }),
  consentVersion: z.string().trim().max(20).optional().default(VERSION_ACTUAL),
})

export const OPCIONES = { GRADO, CAPACIDAD, URGENCIA }
