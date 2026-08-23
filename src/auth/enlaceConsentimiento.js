import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/**
 * El enlace por el que la persona firma su consentimiento informado antes de
 * la sesión.
 *
 * Mismo mecanismo y mismo secreto que los enlaces de caso y de tamizaje; lo
 * que impide que un token abra la puerta equivocada es el campo `tipo`.
 *
 * No pide confirmar correo, igual que el tamizaje y por la misma razón: una
 * barrera de más es la mejor forma de que no se firme. Lo que protege es que
 * el token es imposible de adivinar, y lo único que enseña es el nombre de
 * pila, con quién es la sesión y cuándo.
 *
 * Vive 30 días: más que cualquier cita razonablemente agendada a futuro. Si
 * la cita se reprograma lejos, se genera enlace nuevo desde el detalle.
 */

const TIPO = 'consentimiento'
const TTL_MS = 30 * 24 * 3600 * 1000

function firmar(cuerpo) {
  return createHmac('sha256', env.sharedCaseSecret).update(cuerpo).digest('hex')
}

export function crearEnlaceConsentimiento(appointmentId) {
  const cuerpo = Buffer.from(
    JSON.stringify({ tipo: TIPO, cita: appointmentId, vence: Date.now() + TTL_MS }),
  ).toString('base64url')

  return `${cuerpo}.${firmar(cuerpo)}`
}

export function leerEnlaceConsentimiento(token) {
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
  if (!datos?.cita) return null
  if (!datos?.vence || Date.now() > datos.vence) return null

  return datos
}
