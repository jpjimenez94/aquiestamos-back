import { describe, it, expect } from 'vitest'
import { crearEnlaceTamizaje, leerEnlaceTamizaje } from '../src/auth/enlaceTamizaje.js'
import { crearEnlaceConsentimiento, leerEnlaceConsentimiento } from '../src/auth/enlaceConsentimiento.js'
import { crearEnlaceEncuesta, leerEnlaceEncuesta } from '../src/auth/enlaceEncuesta.js'
import { crearEnlaceFeedback, leerEnlaceFeedback } from '../src/auth/enlaceFeedback.js'
import { crearEnlaceDocumentos, leerEnlaceDocumentos } from '../src/auth/enlaceDocumentos.js'
import { primerNombre } from '../src/nombre.js'

const ID = '11111111-2222-3333-4444-555555555555'

/**
 * Cinco puertas, cinco llaves, y ninguna abre la de al lado.
 *
 * Los cinco enlaces sin sesión —tamizaje, consentimiento, encuesta,
 * experiencia y documentos— se firman con el MISMO secreto. Lo único que
 * impide que la llave de uno abra la puerta de otro es un campo de tipo. Si
 * alguien añade un flujo nuevo y se olvida de comprobarlo, el enlace de la
 * encuesta de una persona serviría para abrir el consentimiento de otra.
 *
 * Por eso esto se comprueba entero y no de a uno: lo que importa no es que
 * cada lector acepte su token, es que rechace los otros cuatro.
 */
describe('las llaves de los enlaces públicos no se cruzan', () => {
  const flujos = [
    ['tamizaje', crearEnlaceTamizaje, leerEnlaceTamizaje],
    ['consentimiento', crearEnlaceConsentimiento, leerEnlaceConsentimiento],
    ['encuesta', crearEnlaceEncuesta, leerEnlaceEncuesta],
    ['experiencia', crearEnlaceFeedback, leerEnlaceFeedback],
    ['documentos', crearEnlaceDocumentos, leerEnlaceDocumentos],
  ]

  for (const [nombre, crear, leer] of flujos) {
    it(`el enlace de ${nombre} abre su propia puerta`, () => {
      expect(leer(crear(ID))).not.toBeNull()
    })

    it(`el enlace de ${nombre} no abre ninguna de las otras cuatro`, () => {
      const token = crear(ID)
      for (const [otroNombre, , otroLeer] of flujos) {
        if (otroNombre === nombre) continue
        expect(otroLeer(token), `${nombre} abrió ${otroNombre}`).toBeNull()
      }
    })
  }

  it('un token manipulado no vale en ninguna puerta', () => {
    const token = crearEnlaceTamizaje(ID)
    const roto = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA')
    for (const [, , leer] of flujos) expect(leer(roto)).toBeNull()
  })

  it('la basura tampoco', () => {
    for (const [, , leer] of flujos) {
      for (const basura of ['', 'x', 'a.b', null, undefined, 'a'.repeat(3000)]) {
        expect(leer(basura)).toBeNull()
      }
    }
  })
})

/**
 * El nombre de pila, que decide cuánto se sabe de alguien sin sesión.
 *
 * Estaba escrito siete veces por el backend y ya no coincidían. Es la función
 * que evita que las pantallas públicas saluden con el nombre completo de una
 * persona que está recibiendo atención psicológica.
 */
describe('primerNombre', () => {
  it('se queda con el primero', () => {
    expect(primerNombre('Lucía Valencia Potes')).toBe('Lucía')
    expect(primerNombre('  Ana   Sofía  ')).toBe('Ana')
    expect(primerNombre('Gabriel')).toBe('Gabriel')
  })

  it('devuelve null cuando no hay nombre, para que quien llame decida', () => {
    expect(primerNombre('')).toBeNull()
    expect(primerNombre('   ')).toBeNull()
    expect(primerNombre(null)).toBeNull()
    expect(primerNombre(undefined)).toBeNull()
  })

  it('nunca devuelve el apellido', () => {
    const completo = 'Martha Liliana Riaño Jaimes'
    const pila = primerNombre(completo)
    expect(completo).toContain(pila)
    expect(pila).not.toContain('Riaño')
    expect(pila).not.toContain('Jaimes')
  })
})
