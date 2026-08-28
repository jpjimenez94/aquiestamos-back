import { describe, it, expect } from 'vitest'
import { VERSION_ACTUAL, VERSIONES_VALIDAS, esVersionValida } from '../src/consent/versions.js'

/**
 * La lista de versiones vive en dos repos a la vez.
 *
 * El formulario manda la versión que la persona aceptó y aquí se valida contra
 * esta lista. Es un contrato entre dos repos que nadie compila junto: si el
 * texto cambia en el front y sube a una versión nueva, y aquí no se añade,
 * TODOS los envíos empiezan a rebotar con un error de validación. Nadie puede
 * pedir ayuda y el formulario no dice por qué.
 *
 * Esa es exactamente la clase de fallo que no se ve en local —donde se prueba
 * con la versión de siempre— y que aparece entero en producción.
 */

describe('las versiones del consentimiento', () => {
  it('la actual está en la lista de válidas', () => {
    // Suena obvio. Es el error de un carácter que deja el formulario caído.
    expect(VERSIONES_VALIDAS).toContain(VERSION_ACTUAL)
    expect(esVersionValida(VERSION_ACTUAL)).toBe(true)
  })

  /**
   * Las viejas siguen siendo válidas. No es laxitud: son los registros que ya
   * existen, y quitarlas de aquí no invalidaría un envío futuro —invalidaría
   * la prueba de lo que ya autorizó alguien.
   */
  it('las anteriores se conservan', () => {
    expect(esVersionValida('2026-08')).toBe(true)
    expect(esVersionValida('2026-08-google')).toBe(true)
  })

  it('una versión inventada no pasa', () => {
    expect(esVersionValida('2025-01')).toBe(false)
    expect(esVersionValida('')).toBe(false)
    expect(esVersionValida(null)).toBe(false)
  })

  /**
   * Este es el que de verdad importa: el front ya está mandando 2026-09,
   * porque las dos casillas de la atención psicológica se volvieron una y el
   * texto cambió. Si esta línea se cae, es que alguien subió el texto allá sin
   * abrir este archivo.
   */
  it('acepta la versión que manda hoy el formulario', () => {
    expect(esVersionValida('2026-09')).toBe(true)
  })
})
