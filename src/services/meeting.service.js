import crypto from 'crypto'
import { env } from '../config/env.js'

/**
 * Genera un enlace de videollamada criptográficamente seguro, único y determinista
 * para una cita virtual.
 *
 * Utiliza HMAC SHA-256 sobre el ID de la cita con el secreto del servidor,
 * generando un nombre de sala único que nadie puede adivinar ni interceptar.
 */
export function generarEnlaceVideollamada(appointmentId) {
  if (!appointmentId) return null
  const hash = crypto
    .createHmac('sha256', env.jwtSecret || 'aqui-estamos-secret-key')
    .update(`appointment-room-${appointmentId}`)
    .digest('hex')
    .slice(0, 16)

  const shortId = String(appointmentId).replace(/-/g, '').slice(0, 8)
  return `https://meet.jit.si/AquiEstamos-${shortId}-${hash}`
}
