import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/**
 * Tokens de confirmación para la invitación de tareas a voluntarios.
 *
 * Usamos el mismo patrón HMAC-SHA256 que el resto del proyecto en lugar de
 * jsonwebtoken: más liviano, sin dependencia extra y alineado con enlaceCompacto.js.
 *
 * Formato: <payload_base64url>.<firma_hex>
 *
 * El payload incluye assignmentId, collaboratorId y taskId para que el
 * controlador pueda verificar que el token corresponde al registro real.
 * La expiración va en el payload: si la firma es válida y el tiempo no venció,
 * el enlace sirve. No hace falta consultar la base hasta ese punto.
 */

const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

function firmar(cuerpo) {
  return createHmac('sha256', env.sharedCaseSecret).update(cuerpo).digest('hex')
}

export function generarTokenAsignacion(assignmentId, collaboratorId, taskId) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: assignmentId,
      cid: collaboratorId,
      tid: taskId,
      tipo: 'task-confirm',
      vence: Date.now() + EXPIRY_MS,
    }),
  ).toString('base64url')

  const firma = firmar(payload)
  return `${payload}.${firma}`
}

export function verificarTokenAsignacion(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  const corte = token.lastIndexOf('.')
  if (corte < 1) return null

  const payload = token.slice(0, corte)
  const firma = token.slice(corte + 1)
  const esperada = firmar(payload)

  // Comparación en tiempo constante para no filtrar bits por timing.
  if (firma.length !== esperada.length) return null
  if (!timingSafeEqual(Buffer.from(firma, 'utf8'), Buffer.from(esperada, 'utf8'))) return null

  let datos
  try {
    datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (datos?.tipo !== 'task-confirm') return null
  if (!datos?.sub || !datos?.cid || !datos?.tid) return null
  if (!datos?.vence || Date.now() > datos.vence) return null

  return datos
}
