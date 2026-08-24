import { describe, it, expect } from 'vitest'
import {
  crearEnlaceConsentimiento,
  leerEnlaceConsentimiento,
} from '../src/auth/enlaceConsentimiento.js'
import { crearEnlaceTamizaje } from '../src/auth/enlaceTamizaje.js'
import { firmarConsentimientoSchema } from '../src/validators/consentimiento.schema.js'

/**
 * El enlace por el que se firma el consentimiento antes de la sesión. Es una
 * puerta pública: estas pruebas fijan que solo abre su propia puerta.
 */

describe('enlace de consentimiento', () => {
  it('lo que se crea se puede leer, y trae la cita', () => {
    const token = crearEnlaceConsentimiento('cita-123')
    const datos = leerEnlaceConsentimiento(token)
    expect(datos?.cita).toBe('cita-123')
  })

  it('un token manoseado no abre', () => {
    const token = crearEnlaceConsentimiento('cita-123')
    expect(leerEnlaceConsentimiento(token.slice(0, -1) + 'x')).toBeNull()
    expect(leerEnlaceConsentimiento('basura')).toBeNull()
    expect(leerEnlaceConsentimiento('')).toBeNull()
  })

  /** Mismo secreto, puertas distintas: el campo `tipo` es el que separa. */
  it('un token de tamizaje no abre la puerta del consentimiento', () => {
    expect(leerEnlaceConsentimiento(crearEnlaceTamizaje('solicitud-1'))).toBeNull()
  })
})

describe('lo que se manda al firmar', () => {
  const valido = { acepta: true, nombreFirma: 'Camilo Andrés Pérez', version: '2026-08' }

  it('con todo puesto, pasa', () => {
    expect(firmarConsentimientoSchema.safeParse(valido).success).toBe(true)
  })

  it('sin aceptar no hay firma', () => {
    expect(firmarConsentimientoSchema.safeParse({ ...valido, acepta: false }).success).toBe(false)
  })

  it('el nombre es la firma: una letra no firma nada', () => {
    expect(firmarConsentimientoSchema.safeParse({ ...valido, nombreFirma: 'C' }).success).toBe(false)
  })

  it('sin versión no se sabe qué texto aceptó', () => {
    const { version, ...sin } = valido
    expect(firmarConsentimientoSchema.safeParse(sin).success).toBe(false)
  })
})

describe('enlace de la encuesta del cierre', () => {
  it('lo que se crea se puede leer, y trae la asignación', async () => {
    const { crearEnlaceEncuesta, leerEnlaceEncuesta } = await import('../src/auth/enlaceEncuesta.js')
    const datos = leerEnlaceEncuesta(crearEnlaceEncuesta('asig-1'))
    expect(datos?.asignacion).toBe('asig-1')
  })

  it('un token de consentimiento no abre la puerta de la encuesta', async () => {
    const { leerEnlaceEncuesta } = await import('../src/auth/enlaceEncuesta.js')
    expect(leerEnlaceEncuesta(crearEnlaceConsentimiento('cita-1'))).toBeNull()
  })
})

describe('lo que se manda en la encuesta', () => {
  it('las dos preguntas son obligatorias; el comentario no', async () => {
    const { responderEncuestaSchema } = await import('../src/validators/encuesta.schema.js')
    expect(
      responderEncuestaSchema.safeParse({ helped: 'SI', wouldRecommend: true }).success,
    ).toBe(true)
    expect(responderEncuestaSchema.safeParse({ helped: 'SI' }).success).toBe(false)
    expect(responderEncuestaSchema.safeParse({ wouldRecommend: true }).success).toBe(false)
  })
})
