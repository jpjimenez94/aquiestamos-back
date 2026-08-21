import { describe, it, expect } from 'vitest'
import { hashearClave, verificarClave, problemasDeClave, CLAVE_MIN } from '../src/auth/password.js'
import { generarToken, hashearToken, tokensIguales, fechaExpiracion, tokenDePeticion } from '../src/auth/session.js'

describe('claves', () => {
  it('el hash es argon2id y no contiene la clave', async () => {
    const h = await hashearClave('correcta-horse-42')
    expect(h.startsWith('$argon2id$')).toBe(true)
    expect(h).not.toContain('correcta-horse-42')
  })

  it('verifica la clave correcta y rechaza la incorrecta', async () => {
    const h = await hashearClave('correcta-horse-42')
    expect(await verificarClave(h, 'correcta-horse-42')).toBe(true)
    expect(await verificarClave(h, 'correcta-horse-43')).toBe(false)
  })

  it('dos hashes de la misma clave son distintos (sal aleatoria)', async () => {
    const a = await hashearClave('correcta-horse-42')
    const b = await hashearClave('correcta-horse-42')
    expect(a).not.toBe(b)
  })

  it('un hash corrupto no lanza, devuelve false', async () => {
    expect(await verificarClave('esto-no-es-un-hash', 'lo-que-sea')).toBe(false)
  })

  it('exige longitud, letra y número', () => {
    expect(problemasDeClave('corta1')).toContain(`Debe tener al menos ${CLAVE_MIN} caracteres`)
    expect(problemasDeClave('123456789012345')).toContain('Debe incluir alguna letra')
    expect(problemasDeClave('sololetrasaqui')).toContain('Debe incluir algún número')
    expect(problemasDeClave('clavevalida123')).toEqual([])
  })
})

describe('tokens de sesión', () => {
  it('cada token es distinto y suficientemente largo', () => {
    const a = generarToken()
    const b = generarToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(43)
  })

  it('el hash es estable y de 64 caracteres hex', () => {
    const t = generarToken()
    expect(hashearToken(t)).toBe(hashearToken(t))
    expect(hashearToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el hash no permite recuperar el token', () => {
    const t = generarToken()
    expect(hashearToken(t)).not.toContain(t)
  })

  it('compara hashes en tiempo constante', () => {
    const h = hashearToken('abc')
    expect(tokensIguales(h, h)).toBe(true)
    expect(tokensIguales(h, hashearToken('abd'))).toBe(false)
    expect(tokensIguales(h, '')).toBe(false)
    expect(tokensIguales('', '')).toBe(false)
  })

  it('la expiración se calcula hacia adelante', () => {
    const en12 = fechaExpiracion(12)
    const diff = en12.getTime() - Date.now()
    expect(diff).toBeGreaterThan(11.9 * 3600 * 1000)
    expect(diff).toBeLessThan(12.1 * 3600 * 1000)
  })

  it('lee el token del encabezado Authorization', () => {
    const req = (valor) => ({ get: () => valor })
    expect(tokenDePeticion(req('Bearer abc123'))).toBe('abc123')
    expect(tokenDePeticion(req('bearer abc123'))).toBe('abc123')
    expect(tokenDePeticion(req('Basic abc123'))).toBe(null)
    expect(tokenDePeticion(req('abc123'))).toBe(null)
    expect(tokenDePeticion(req(''))).toBe(null)
    expect(tokenDePeticion({ get: () => undefined })).toBe(null)
  })
})

/**
 * El enlace de caso es la única puerta pública a los datos de una persona
 * acompañada. Su secreto tuvo por defecto un valor publicado en el
 * repositorio, y el guardián que lo exigía dependía de NODE_ENV: si el
 * servidor arrancaba sin esa variable —lo que pasa por omisión en Railway—
 * producción firmaba con el secreto público y cualquiera podía fabricar un
 * enlace válido. Pasó de verdad.
 */
describe('secreto del enlace de casos', () => {
  it('no puede caer nunca al valor de ejemplo publicado', async () => {
    const { env } = await import('../src/config/env.js')
    expect(env.sharedCaseSecret).not.toBe('secreto-de-desarrollo-no-usar-en-produccion')
    expect(env.sharedCaseSecret.length).toBeGreaterThan(10)
  })
})
