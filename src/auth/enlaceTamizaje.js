import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { CODIGO, crearCompacto, leerCompacto } from './enlaceCompacto.js'

/**
 * El enlace por el que la persona responde su propio tamizaje.
 *
 * Mismo mecanismo que el enlace de caso: el cuerpo va en base64url —que no
 * contiene puntos— y el punto separa cuerpo de firma sin ambigüedad.
 *
 * Comparte el secreto con el enlace de caso a propósito. Exigir otra variable
 * de entorno significa que un despliegue que la olvide no arranca, y ya hubo
 * un problema justamente por eso. Lo que impide que un token sirva para la
 * otra puerta es el campo `tipo`: un token de tamizaje no lleva `paciente`,
 * así que el `leerToken` del caso compartido lo rechaza, y un token de caso no
 * lleva `tipo`, así que este lo rechaza.
 *
 * A diferencia del enlace de caso, este NO pide confirmar un correo: la
 * solicitud puede venir sin correo, y ponerle una barrera a alguien en crisis
 * para que conteste siete preguntas es la mejor forma de que no conteste. Lo
 * que protege es que el token es imposible de adivinar y no devuelve más que
 * el nombre de pila de quien lo pidió.
 */

const TIPO = 'tamizaje'

function firmar(cuerpo) {
  return createHmac('sha256', env.sharedCaseSecret).update(cuerpo).digest('hex')
}

export function crearEnlaceTamizaje(supportRequestId) {
  return crearCompacto(CODIGO.tamizaje, supportRequestId, Date.now() + env.triageTtlHours * 3600 * 1000)
}

export function leerEnlaceTamizaje(token) {
  if (typeof token !== 'string' || token.length > 2048) return null

  // Primero el formato compacto; si trae punto, es un enlace del formato viejo.
  const compacto = leerCompacto(token, CODIGO.tamizaje)
  if (compacto) return { tipo: TIPO, solicitud: compacto.uuid, vence: compacto.vence }

  const corte = token.lastIndexOf('.')
  if (corte < 1) return null

  const cuerpo = token.slice(0, corte)
  const firma = token.slice(corte + 1)
  const esperada = firmar(cuerpo)

  // Comparación en tiempo constante: `!==` corta en el primer byte distinto y
  // filtra, por el tiempo de respuesta, cuánto acertó quien lo intenta.
  if (firma.length !== esperada.length) return null
  if (!timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null

  let datos
  try {
    datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (datos?.tipo !== TIPO) return null
  if (!datos?.solicitud) return null
  if (!datos?.vence || Date.now() > datos.vence) return null

  return datos
}
