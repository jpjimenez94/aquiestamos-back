import { describe, it, expect } from 'vitest'
import { puede, tieneRol, rolesDe } from '../src/auth/permissions.js'
import { tamizajeSegunRol } from '../src/views/triage.view.js'
import { crearUsuarioSchema, editarUsuarioSchema } from '../src/validators/auth.schema.js'

/**
 * Una cuenta, una verdad sobre sus roles.
 *
 * El usuario guarda `roles[]` —el bueno— y `role` —el de antes de que una
 * cuenta pudiera tener varios—. `puede()` leía `roles[]`; diez sitios del
 * backend leían `role` a mano, incluidas cuatro vistas que deciden cuánto dato
 * sensible sale.
 *
 * Con los dos campos en desacuerdo, salía una cuenta que no podía hacer nada y
 * lo veía todo. Estas pruebas fijan que eso ya no pasa, por los dos lados: las
 * lecturas van por la matriz, y el validador no deja crear el desacuerdo.
 */

/** Una cuenta de solo lectura a la que alguien le dejó `role: 'ADMIN'`. */
const cuentaTramposa = { id: 'u1', role: 'ADMIN', roles: ['LECTURA'] }

/** Una administradora de verdad, cuyo campo viejo dice otra cosa. */
const adminPorRoles = { id: 'u2', role: 'AGENDADOR', roles: ['ADMIN'] }

/** Una cuenta antigua: solo tiene el campo viejo. */
const cuentaAntigua = { id: 'u3', role: 'ADMIN', roles: [] }

const tamizaje = {
  id: 't1',
  suggestedPriority: 'ALTA',
  reasons: ['una razón'],
  createdAt: new Date(),
  selfHarmThoughts: 'SI',
  distress: 'ALTO',
  safePlace: 'NO',
  sleepAndEat: 'MAL',
  dailyFunction: 'NO',
  hasSupport: 'NO',
  howSoon: 'HOY',
  consentVersion: 'v1',
}

describe('los roles se leen en un solo sitio', () => {
  it('rolesDe prefiere roles[] y cae al campo viejo si está vacío', () => {
    expect(rolesDe(adminPorRoles)).toEqual(['ADMIN'])
    expect(rolesDe(cuentaAntigua)).toEqual(['ADMIN'])
    expect(rolesDe(null)).toEqual([])
    expect(rolesDe({})).toEqual([])
  })

  it('tieneRol no se deja engañar por el campo viejo', () => {
    expect(tieneRol(cuentaTramposa, 'ADMIN')).toBe(false)
    expect(tieneRol(adminPorRoles, 'ADMIN')).toBe(true)
    expect(tieneRol(cuentaAntigua, 'ADMIN')).toBe(true)
  })
})

describe('el tamizaje completo solo sale con permiso de verdad', () => {
  // Es el dato más delicado del sistema: incluye si la persona dijo tener
  // pensamientos de hacerse daño.
  it('una cuenta de solo lectura con role ADMIN NO ve las respuestas', () => {
    const salida = tamizajeSegunRol(tamizaje, cuentaTramposa)
    expect(salida.respuestas).toBeUndefined()
    expect(JSON.stringify(salida)).not.toContain('selfHarmThoughts')
  })

  it('una administradora por roles[] SÍ las ve, aunque su campo viejo diga otra cosa', () => {
    const salida = tamizajeSegunRol(tamizaje, adminPorRoles)
    expect(salida.respuestas?.selfHarmThoughts).toBe('SI')
  })

  it('las cuentas antiguas, con solo el campo viejo, siguen funcionando', () => {
    expect(tamizajeSegunRol(tamizaje, cuentaAntigua).respuestas?.selfHarmThoughts).toBe('SI')
  })

  it('sin usuario no sale nada sensible', () => {
    expect(tamizajeSegunRol(tamizaje, null).respuestas).toBeUndefined()
  })

  it('los permisos y las vistas dicen lo mismo', () => {
    // Esta es la propiedad de fondo: si alguna vez vuelven a separarse, aquí
    // se ve, sin importar por qué camino se separaron.
    for (const cuenta of [cuentaTramposa, adminPorRoles, cuentaAntigua]) {
      const vistaDaTodo = Boolean(tamizajeSegunRol(tamizaje, cuenta).respuestas)
      expect(vistaDaTodo).toBe(puede(cuenta, 'dato-sensible:ver'))
    }
  })
})

describe('no se puede crear una cuenta con los dos campos en desacuerdo', () => {
  const base = { email: 'a@b.co', name: 'Prueba', password: 'ClaveLarga123!' }

  it('rechaza role fuera de roles', () => {
    const r = crearUsuarioSchema.safeParse({ ...base, role: 'ADMIN', roles: ['LECTURA'] })
    expect(r.success).toBe(false)
  })

  it('acepta cuando concuerdan', () => {
    expect(crearUsuarioSchema.safeParse({ ...base, role: 'ADMIN', roles: ['ADMIN', 'LECTURA'] }).success).toBe(true)
  })

  it('acepta cuando solo se manda uno de los dos', () => {
    expect(crearUsuarioSchema.safeParse({ ...base, roles: ['LECTURA'] }).success).toBe(true)
    expect(crearUsuarioSchema.safeParse({ ...base, role: 'LECTURA' }).success).toBe(true)
  })

  it('editar tiene la misma regla', () => {
    expect(editarUsuarioSchema.safeParse({ role: 'ADMIN', roles: ['LECTURA'] }).success).toBe(false)
    expect(editarUsuarioSchema.safeParse({ role: 'ADMIN', roles: ['ADMIN'] }).success).toBe(true)
  })
})
