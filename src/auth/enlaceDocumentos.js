import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { CODIGO, crearCompacto, leerCompacto } from './enlaceCompacto.js'

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
  return crearCompacto(CODIGO.documentos, professionalId, Date.now() + TTL_MS)
}

export function leerEnlaceDocumentos(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  // Primero el formato compacto; si trae punto, es un enlace del formato viejo.
  const compacto = leerCompacto(token, CODIGO.documentos)
  if (compacto) return { tipo: TIPO, profesional: compacto.uuid, vence: compacto.vence }

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
