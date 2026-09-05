import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/**
 * El formato compacto de los enlaces públicos.
 *
 * El formato original metía un JSON en base64 y le pegaba la firma entera en
 * hexadecimal: doscientos caracteres que en WhatsApp se ven como una muralla
 * y a más de una persona le olieron a estafa. Todo lo que un token necesita
 * decir es QUÉ puerta abre, PARA QUIÉN y HASTA CUÁNDO — eso cabe en 21 bytes:
 *
 *   [tipo: 1 byte] [uuid: 16 bytes] [vence en minutos unix: 4 bytes]
 *
 * más la firma HMAC-SHA256 truncada a 16 bytes (128 bits: truncar la firma es
 * práctica estándar — RFC 2104 — y sigue siendo infalsificable). Total: 37
 * bytes, ~50 caracteres en base64url. La cuarta parte de antes.
 *
 * Un token compacto no lleva punto; el formato viejo siempre lo lleva entre
 * cuerpo y firma. Ese es el discriminador: cada módulo intenta el formato
 * compacto y, si ve un punto, cae al lector viejo — así los enlaces ya
 * enviados por WhatsApp siguen abriendo hasta su vencimiento natural.
 */

export const CODIGO = {
  tamizaje: 1,
  consentimiento: 2,
  encuesta: 3,
  documentos: 4,
  feedback: 5,
  // La agenda de la persona. Es el único de los seis que apunta a la PERSONA y
  // no a un trámite concreto, y por eso sobrevive a un cambio de profesional.
  agenda: 6,

  /**
   * La sala de la videollamada, una por rol.
   *
   * El rol viaja en el propio código y no dentro del cuerpo: así el enlace
   * compacto sirve para la sala sin crecer ni un byte, y el que abre sabe
   * quién entra sin tener que confiar en nada que venga en la URL.
   *
   * Es lo que permitió acortarlos de 132 caracteres a 50. Un enlace de sala
   * viaja por WhatsApp a alguien que a veces lo abre desde un teléfono con
   * mala señal y a veces lo copia a mano; cuanto menos ocupe y menos se parta
   * en dos líneas, mejor.
   */
  salaPaciente: 7,
  salaProfesional: 8,

  /**
   * «¿Cómo estás tú?»: el espacio de quien acompaña. Apunta al PROFESIONAL,
   * como `documentos`, y no a un caso: el espacio es suyo, no de la persona
   * a la que acompaña.
   */
  cuidado: 9,
}

const LARGO_CUERPO = 21
const LARGO_FIRMA = 16

function firmar(cuerpo) {
  return createHmac('sha256', env.sharedCaseSecret).update(cuerpo).digest().subarray(0, LARGO_FIRMA)
}

export function crearCompacto(codigo, uuid, venceMs) {
  const hex = String(uuid).replace(/-/g, '')
  if (hex.length !== 32) throw new Error('enlace compacto: el id no es un uuid')

  const cuerpo = Buffer.alloc(LARGO_CUERPO)
  cuerpo.writeUInt8(codigo, 0)
  Buffer.from(hex, 'hex').copy(cuerpo, 1)
  cuerpo.writeUInt32BE(Math.ceil(venceMs / 60000), 17)

  return Buffer.concat([cuerpo, firmar(cuerpo)]).toString('base64url')
}

export function leerCompacto(token, codigo) {
  if (typeof token !== 'string' || token.includes('.')) return null

  let bytes
  try {
    bytes = Buffer.from(token, 'base64url')
  } catch {
    return null
  }
  if (bytes.length !== LARGO_CUERPO + LARGO_FIRMA) return null

  /**
   * Canonicidad: en base64url el ultimo caracter tiene bits sobrantes, asi
   * que dos tokens distintos en texto pueden decodificar a los mismos bytes.
   * Re-codificar y comparar hace que tocar CUALQUIER caracter invalide.
   */
  if (bytes.toString('base64url') !== token) return null

  const cuerpo = bytes.subarray(0, LARGO_CUERPO)
  const firma = bytes.subarray(LARGO_CUERPO)
  // Comparación en tiempo constante, como en el formato viejo.
  if (!timingSafeEqual(firma, firmar(cuerpo))) return null

  if (cuerpo.readUInt8(0) !== codigo) return null

  const vence = cuerpo.readUInt32BE(17) * 60000
  if (Date.now() > vence) return null

  const hex = cuerpo.subarray(1, 17).toString('hex')
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`

  return { uuid, vence }
}
