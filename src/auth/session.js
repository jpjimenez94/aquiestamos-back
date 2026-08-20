import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

/**
 * El token de sesión se entrega al cliente una sola vez y en la base solo queda
 * su SHA-256. Si alguien se lleva una copia de la tabla, no obtiene con qué
 * entrar.
 */
export function generarToken() {
  return randomBytes(32).toString('base64url')
}

export function hashearToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

/** Comparación en tiempo constante, por si el hash llega desde fuera. */
export function tokensIguales(a, b) {
  const ba = Buffer.from(a ?? '', 'hex')
  const bb = Buffer.from(b ?? '', 'hex')
  if (ba.length !== bb.length || ba.length === 0) return false
  return timingSafeEqual(ba, bb)
}

export function fechaExpiracion(horas) {
  return new Date(Date.now() + horas * 60 * 60 * 1000)
}

/** Lee el token del encabezado `Authorization: Bearer <token>`. */
export function tokenDePeticion(req) {
  const cabecera = req.get('authorization') ?? ''
  const [esquema, valor] = cabecera.split(' ')
  if (!valor || esquema.toLowerCase() !== 'bearer') return null
  return valor.trim() || null
}
