import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/**
 * Genera un token corto y seguro de 24 caracteres hex (12 bytes).
 * Resulta en enlaces limpios y compactos para WhatsApp y correo:
 * https://www.redaquiestamos.org/turno/3e069509a6a4415389d9f033
 */
export function generarTokenAsignacion() {
  return randomBytes(12).toString('hex')
}

export function verificarTokenAsignacion(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  const corte = token.lastIndexOf('.')
  if (corte < 1) return null

  const payload = token.slice(0, corte)
  const firma = token.slice(corte + 1)
  const esperada = createHmac('sha256', env.sharedCaseSecret).update(payload).digest('hex')

  if (firma.length !== esperada.length) return null
  if (!timingSafeEqual(Buffer.from(firma, 'utf8'), Buffer.from(esperada, 'utf8'))) return null

  try {
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (datos?.tipo !== 'task-confirm') return null
    if (!datos?.sub || !datos?.cid || !datos?.tid) return null
    if (!datos?.vence || Date.now() > datos.vence) return null
    return datos
  } catch {
    return null
  }
}
