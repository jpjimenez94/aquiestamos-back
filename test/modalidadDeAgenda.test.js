import { describe, it, expect } from 'vitest'
import { modalidadDeAgenda, modalidadDeSesion } from '../src/services/scheduling.service.js'

/**
 * Dos enums con la misma palabra. La persona prefiere entre PRESENCIAL,
 * VIRTUAL e INDIFERENTE; la agenda y la cita solo conocen PRESENCIAL, VIRTUAL
 * y AMBAS. Pasar uno donde va el otro funcionó hasta que alguien marcó
 * «indiferente», y entonces dos personas vieron «Error interno del servidor»
 * en el enlace para elegir su hora.
 */
describe('de lo que la persona prefiere a lo que la agenda entiende', () => {
  it('una preferencia concreta se respeta', () => {
    expect(modalidadDeAgenda('PRESENCIAL')).toBe('PRESENCIAL')
    expect(modalidadDeAgenda('VIRTUAL')).toBe('VIRTUAL')
  })

  it('«indiferente» no es una modalidad: es no filtrar', () => {
    expect(modalidadDeAgenda('INDIFERENTE')).toBeUndefined()
    expect(modalidadDeAgenda(null)).toBeUndefined()
    expect(modalidadDeAgenda(undefined)).toBeUndefined()
  })

  it('nada que no entienda la agenda pasa como filtro', () => {
    expect(modalidadDeAgenda('AMBAS')).toBeUndefined()
    expect(modalidadDeAgenda('lo que sea')).toBeUndefined()
  })
})

describe('la modalidad con la que nace la sesión', () => {
  it('si la persona eligió, es esa', () => {
    expect(modalidadDeSesion('PRESENCIAL', 'VIRTUAL')).toBe('PRESENCIAL')
  })

  it('si le da igual, es la del profesional', () => {
    expect(modalidadDeSesion('INDIFERENTE', 'PRESENCIAL')).toBe('PRESENCIAL')
    expect(modalidadDeSesion(null, 'VIRTUAL')).toBe('VIRTUAL')
  })

  /**
   * AMBAS es lo que el profesional OFRECE, no cómo ocurre una sesión. Si a
   * ella le da igual y él ofrece las dos, virtual: es como trabaja la red por
   * defecto y no obliga a nadie a desplazarse sin haberlo pedido.
   */
  it('si le da igual y el profesional ofrece las dos, virtual', () => {
    expect(modalidadDeSesion('INDIFERENTE', 'AMBAS')).toBe('VIRTUAL')
  })

  it('nunca devuelve AMBAS ni INDIFERENTE', () => {
    for (const p of ['INDIFERENTE', null, undefined, 'AMBAS']) {
      for (const m of ['AMBAS', null, undefined, 'raro']) {
        expect(['PRESENCIAL', 'VIRTUAL']).toContain(modalidadDeSesion(p, m))
      }
    }
  })
})
