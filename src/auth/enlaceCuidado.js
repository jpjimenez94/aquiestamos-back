import { CODIGO, crearCompacto, leerCompacto } from './enlaceCompacto.js'

/**
 * El enlace de «¿Cómo estás tú?»: apunta al PROFESIONAL, no a un caso.
 *
 * Vivía al final del enlace del caso, y eso lo ataba a una persona
 * acompañada: para ofrecérselo había que mandarle el enlace de uno de sus
 * casos, hacía falta que tuviera uno abierto, y el espacio para él quedaba
 * mezclado con el seguimiento de otra persona. Son dos conversaciones
 * distintas y ahora son dos puertas distintas.
 *
 * Dura tres meses: no es un trámite con fecha —como firmar o subir la tarjeta—
 * sino un espacio al que puede volver cuando le pese algo. Se regenera desde
 * Cuidado del equipo cada vez que se le ofrece, así que un enlace vencido no
 * deja a nadie fuera.
 */
const TTL_MS = 90 * 24 * 3600 * 1000

export function crearEnlaceCuidado(professionalId) {
  return crearCompacto(CODIGO.cuidado, professionalId, Date.now() + TTL_MS)
}

export function leerEnlaceCuidado(token) {
  if (typeof token !== 'string' || token.length > 2048) return null
  const compacto = leerCompacto(token, CODIGO.cuidado)
  if (!compacto) return null
  return { profesional: compacto.uuid, vence: compacto.vence }
}
