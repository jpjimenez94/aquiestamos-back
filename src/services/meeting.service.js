import crypto from 'crypto'
import { env } from '../config/env.js'

/**
 * Genera un enlace de videollamada criptográficamente seguro, único y determinista
 * para una cita virtual.
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

/**
 * Genera un token HMAC sellado y a prueba de manipulación para la sala de espera.
 * Formato: base64url(payload) + '.' + hmac(payload, secret)
 */
export function generarTokenSala(appointmentId, role = 'PACIENTE') {
  if (!appointmentId) return null
  const payloadObj = {
    aid: appointmentId,
    rol: role.toUpperCase(),
    t: Date.now(),
  }
  const payloadStr = Buffer.from(JSON.stringify(payloadObj)).toString('base64url')
  const secret = env.jwtSecret || 'aqui-estamos-secret-key'
  const firma = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url')
  return `${payloadStr}.${firma}`
}

/**
 * Verifica un token de sala o reconoce un UUID directo para retrocompatibilidad.
 */
export function verificarTokenSala(tokenOrId) {
  if (!tokenOrId || typeof tokenOrId !== 'string') return null

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(tokenOrId)) {
    return { aid: tokenOrId, rol: null, isDirectId: true }
  }

  const parts = tokenOrId.split('.')
  if (parts.length !== 2) return null

  const [payloadStr, firma] = parts
  const secret = env.jwtSecret || 'aqui-estamos-secret-key'
  const esperada = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url')

  if (firma.length !== esperada.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(firma, 'utf8'), Buffer.from(esperada, 'utf8'))) return null

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'))
    if (!payload.aid) return null
    return {
      aid: payload.aid,
      rol: payload.rol || 'PACIENTE',
      isDirectId: false,
    }
  } catch {
    return null
  }
}
