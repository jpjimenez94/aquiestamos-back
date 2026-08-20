import { hash, verify, Algorithm } from '@node-rs/argon2'

/**
 * Argon2id con los parámetros que recomienda OWASP (19 MiB, 2 iteraciones).
 * El paquete trae binarios precompilados para Windows, macOS y Linux, así que
 * no hace falta compilar nada en Railway.
 */
const OPCIONES = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

/**
 * Hash de una contraseña que no existe, para gastar el mismo tiempo cuando el
 * correo no está registrado. Sin esto, la diferencia de tiempo de respuesta
 * revela qué correos tienen cuenta.
 */
let hashSenuelo = null

export async function hashearClave(clave) {
  return hash(clave, OPCIONES)
}

export async function verificarClave(hashGuardado, clave) {
  try {
    return await verify(hashGuardado, clave)
  } catch {
    return false
  }
}

export async function gastarTiempoEquivalente(clave) {
  if (!hashSenuelo) hashSenuelo = await hashearClave('senuelo-sin-uso')
  await verificarClave(hashSenuelo, clave)
}

/** Reglas mínimas de la clave. Se validan también con Zod en la ruta. */
export const CLAVE_MIN = 12

export function problemasDeClave(clave) {
  const problemas = []
  if (clave.length < CLAVE_MIN) problemas.push(`Debe tener al menos ${CLAVE_MIN} caracteres`)
  if (!/[a-záéíóúñ]/i.test(clave)) problemas.push('Debe incluir alguna letra')
  if (!/[0-9]/.test(clave)) problemas.push('Debe incluir algún número')
  return problemas
}
