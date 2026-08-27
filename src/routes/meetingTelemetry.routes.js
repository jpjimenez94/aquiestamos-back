import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { MeetingTelemetryController } from '../controllers/meetingTelemetry.controller.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'

export const meetingTelemetryRoutes = Router()

/**
 * Telemetría de las salas de videollamada.
 *
 * Este router es especial: casi todo lo suyo tiene que ser público, porque
 * quien entra a una sala —la persona acompañada, el profesional— no tiene
 * cuenta en el portal. Solo tiene un enlace. Por eso hay que decidir endpoint
 * por endpoint, y no de un plumazo.
 */

/**
 * Los pings de una llamada en curso: uno cada 25 segundos por participante.
 *
 * El límite es alto a propósito. Detrás de la red de una universidad o de una
 * EPS varias personas comparten IP, y un límite ajustado cortaría la
 * telemetría de una sesión en curso. Esto frena un abuso evidente; no raciona
 * el uso normal.
 */
const limitePings = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas peticiones. Espera un momento.' },
})

/**
 * Entrar, salir y consultar una sala. No se repiten como el ping, así que el
 * límite puede ser más bajo; sigue holgado para que varias personas detrás del
 * mismo router puedan conectarse.
 */
const limiteSala = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas peticiones. Espera un momento.' },
})

/**
 * PRIVADO. El panel de supervisión de la coordinación.
 *
 * Esto estuvo abierto al mundo entero. Devuelve el nombre completo de la
 * persona acompañada, el del profesional y el de cada participante conectado,
 * así que cualquiera que pidiera esta URL desde internet obtenía, en tiempo
 * real, quién está recibiendo atención psicológica y con quién. Comprobado
 * desde fuera, sin credenciales: respondía 200.
 *
 * Bajo la Ley 1581 los datos de salud son datos sensibles con protección
 * reforzada. No era deuda técnica; era una brecha.
 *
 * El único sitio que lo consume es el banner del tablero de agenda, que lo
 * pide desde el servidor con la sesión de quien navega, así que exigir sesión
 * aquí no rompe nada.
 */
meetingTelemetryRoutes.get(
  '/live',
  authenticate,
  authorize('agenda:leer'),
  MeetingTelemetryController.live,
)

/**
 * PÚBLICOS. Son la sala en sí: se entra sin cuenta, solo con el enlace.
 *
 * `/:id/info` le da el nombre de pila de la persona a quien tenga la llave.
 * Mientras `SALA_ACEPTA_UUID` siga en `true`, esa llave puede ser el uuid de
 * la cita a secas; cuando se apague hará falta un token firmado. Ese apagado
 * es lo que de verdad termina de cerrar este endpoint.
 */
meetingTelemetryRoutes.get('/:id/info', limiteSala, MeetingTelemetryController.info)
meetingTelemetryRoutes.post('/:id/join', limiteSala, MeetingTelemetryController.join)
meetingTelemetryRoutes.post('/logs/:logId/ping', limitePings, MeetingTelemetryController.ping)
meetingTelemetryRoutes.post('/:id/leave', limiteSala, MeetingTelemetryController.leave)
meetingTelemetryRoutes.post('/:id/report-error', limiteSala, MeetingTelemetryController.reportError)
