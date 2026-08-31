import { describe, it, expect } from 'vitest'
import { sinSolaparse, DURACION_MINIMA, DESCANSO, GRANULARIDAD } from '../src/services/scheduling.service.js'

/**
 * Los huecos que se le ofrecen a la persona tienen que ser opciones de verdad.
 *
 * Una sesión dura 45 minutos y bloquea 75 con su descanso, pero los inicios se
 * generaban cada 15. Por cada hueco real se pintaban cinco botones que se
 * excluyen entre sí: elegir las 6:00 deja el siguiente inicio en 7:15, así que
 * 6:15, 6:30, 6:45 y 7:00 nunca fueron opciones distintas.
 *
 * En la pantalla de una persona con una profesional de agenda amplia eso eran
 * ochenta botones donde había doce decisiones. A quien está mal, elegir entre
 * ochenta cosas iguales no le da libertad: le da un muro.
 */

const base = new Date('2026-08-31T23:00:00Z') // lunes 6:00 p. m. en Bogotá

function hueco(minutosDesdeBase, duracion = DURACION_MINIMA) {
  const inicio = new Date(base.getTime() + minutosDesdeBase * 60000)
  return { inicio, fin: new Date(inicio.getTime() + duracion * 60000), duracionMinutos: duracion }
}

/** Como los genera el servicio: uno cada 15 minutos. */
function cada15(cuantos) {
  return Array.from({ length: cuantos }, (_, i) => hueco(i * GRANULARIDAD))
}

describe('los huecos que se ofrecen', () => {
  it('el bloque real es la sesión más su descanso', () => {
    expect(DURACION_MINIMA + DESCANSO).toBe(75)
    expect(GRANULARIDAD).toBe(15)
  })

  /**
   * El caso reportado, con números: la tarde del lunes mostraba once botones
   * —de 6:00 a 8:15— para lo que en realidad son dos sesiones posibles.
   */
  it('once botones cada quince minutos son tres opciones reales', () => {
    // Once inicios cada 15 minutos abarcan 150; en bloques de 75 caben tres:
    // 6:00, 7:15 y 8:30. Los otros ocho eran la misma franja desplazada.
    const ofrecidos = sinSolaparse(cada15(11))

    expect(ofrecidos).toHaveLength(3)
    expect(ofrecidos[0].inicio.getTime()).toBe(base.getTime())
    // El siguiente arranca 75 minutos después, no 15.
    expect(ofrecidos[1].inicio.getTime() - ofrecidos[0].inicio.getTime()).toBe(75 * 60000)
  })

  /** Ninguno de los que quedan se pisa con el anterior. */
  it('los que quedan no se solapan entre sí', () => {
    const ofrecidos = sinSolaparse(cada15(24))

    for (let i = 1; i < ofrecidos.length; i++) {
      const finBloqueAnterior = ofrecidos[i - 1].fin.getTime() + DESCANSO * 60000
      expect(ofrecidos[i].inicio.getTime()).toBeGreaterThanOrEqual(finBloqueAnterior)
    }
  })

  /**
   * Y no se pierde ninguna hora real: el primero de cada bloque se conserva.
   * Esto es lo que separa «ofrecer menos» de «esconder disponibilidad».
   */
  it('conserva siempre el más pronto', () => {
    const ofrecidos = sinSolaparse(cada15(11))
    expect(ofrecidos[0].inicio.getTime()).toBe(base.getTime())
  })

  /**
   * La granularidad fina se conserva en la generación a propósito: permite
   * ofrecer un hueco que empieza justo después de una cita ya puesta, en vez de
   * saltar al siguiente múltiplo de 75 y perder la tarde.
   */
  it('respeta un hueco que empieza en un minuto raro', () => {
    const tarde = [hueco(0), hueco(20), hueco(95)]
    const ofrecidos = sinSolaparse(tarde)

    expect(ofrecidos.map((h) => h.inicio.getTime() - base.getTime())).toEqual([
      0,
      95 * 60000,
    ])
  })

  it('con un solo hueco lo devuelve tal cual', () => {
    expect(sinSolaparse([hueco(0)])).toHaveLength(1)
  })

  it('sin huecos devuelve una lista vacía, no falla', () => {
    expect(sinSolaparse([])).toEqual([])
  })

  /** No depende de que lleguen ordenados. */
  it('ordena antes de decidir', () => {
    const desordenados = [hueco(150), hueco(0), hueco(75)]
    const ofrecidos = sinSolaparse(desordenados)
    expect(ofrecidos).toHaveLength(3)
    expect(ofrecidos[0].inicio.getTime()).toBe(base.getTime())
  })
})
