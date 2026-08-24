import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/**
 * El enlace por el que la persona responde la encuesta breve tras el cierre.
 *
 * Mismo mecanismo y mismo secreto que las otras puertas públicas; el campo
 * `tipo` impide que un token abra la puerta equivocada. Vive 60 días: la
 * encuesta es opcional y sin afán, y quien la responde tarde también cuenta.
 */

const TIPO = 'encuesta'
const TTL_MS = 60 * 24 * 3600 * 1000

function firmar(cuerpo) {
  return createHmac('sha256', env.sharedCaseSecret).update(cuerpo).digest('hex')
}

export function crearEnlaceEncuesta(assignmentId) {
  const cuerpo = Buffer.from(
    JSON.stringify({ tipo: TIPO, asignacion: assignmentId, vence: Date.now() + TTL_MS }),
  ).toString('base64url')

  return `${cuerpo}.${firmar(cuerpo)}`
}

export function leerEnlaceEncuesta(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  const corte = token.lastIndexOf('.')
  if (corte < 1) return null

  const cuerpo = token.slice(0, corte)
  const firma = token.slice(corte + 1)
  const esperada = firmar(cuerpo)

  if (firma.length !== esperada.length) return null
  if (!timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null

  let datos
  try {
    datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (datos?.tipo !== TIPO) return null
  if (!datos?.asignacion) return null
  if (!datos?.vence || Date.now() > datos.vence) return null

  return datos
}
