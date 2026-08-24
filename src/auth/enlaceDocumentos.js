import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/**
 * El enlace por el que el profesional sube sus documentos: la tarjeta o el
 * certificado, y su documento de identidad.
 *
 * Mismo mecanismo y mismo secreto que las demás puertas públicas; el campo
 * `tipo` separa las puertas. Vive 30 días y se regenera solo con pedir el
 * mensaje otra vez desde el portal.
 *
 * Que el documento viaje del teléfono del profesional directo al bucket
 * privado es el punto: WhatsApp nunca toca el archivo, nadie lo descarga
 * para volverlo a subir, y el rastro de quién lo miró queda en auditoría.
 */

const TIPO = 'documentos'
const TTL_MS = 30 * 24 * 3600 * 1000

function firmar(cuerpo) {
  return createHmac('sha256', env.sharedCaseSecret).update(cuerpo).digest('hex')
}

export function crearEnlaceDocumentos(professionalId) {
  const cuerpo = Buffer.from(
    JSON.stringify({ tipo: TIPO, profesional: professionalId, vence: Date.now() + TTL_MS }),
  ).toString('base64url')

  return `${cuerpo}.${firmar(cuerpo)}`
}

export function leerEnlaceDocumentos(token) {
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
  if (!datos?.profesional) return null
  if (!datos?.vence || Date.now() > datos.vence) return null

  return datos
}
