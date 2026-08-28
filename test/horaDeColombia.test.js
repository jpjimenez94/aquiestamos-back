import { describe, it, expect } from 'vitest'
import {
  ZONA,
  deLocalAUtc,
  diaDeLaSemana,
  minutosDelDia,
  partesLocales,
  enPalabras,
  formatearLocal,
} from '../src/services/timezone.service.js'

/**
 * Las horas son las de Colombia, corra donde corra el servidor.
 *
 * Esto no estaba protegido por ninguna prueba. Funcionaba —el servicio usa
 * `Intl` con la zona escrita a mano y no la del proceso— pero nada impedía que
 * alguien metiera un `.getHours()` y lo rompiera.
 *
 * Y es el peor fallo posible de los que se pueden meter aquí, por dónde
 * aparecería: en local el servidor ESTÁ en hora de Colombia, así que todo
 * seguiría bien; en Railway, que corre en UTC, las citas se desplazarían cinco
 * horas. Nadie lo vería hasta que alguien llegara a una videollamada a la que
 * la otra persona ya no está.
 *
 * Por eso los casos de abajo son los que separan «hora de Bogotá» de «hora del
 * servidor»: si el código mirara el reloj del proceso, en UTC fallarían; en
 * esta máquina —que está en Bogotá— pasarían igual. Corre `TZ=UTC npx vitest`
 * para verlo desde el otro lado.
 */

describe('la zona es de la red, no del servidor', () => {
  it('está escrita y es Colombia', () => {
    expect(ZONA).toBe('America/Bogota')
  })

  /** Colombia es UTC-5 todo el año: las 9 a. m. de Bogotá son las 14:00 UTC. */
  it('las 9 de la mañana en Bogotá se guardan como 14:00 UTC', () => {
    expect(deLocalAUtc(2026, 8, 31, 9 * 60).toISOString()).toBe('2026-08-31T14:00:00.000Z')
  })

  /**
   * El caso que destapa un servidor en UTC: una sesión de las 8 de la noche
   * en Bogotá cae al DÍA SIGUIENTE en UTC.
   *
   * Un código que leyera el calendario del proceso diría «1 de septiembre» y
   * «martes» de una cita que la persona tiene el lunes por la noche. El
   * mensaje le llegaría con el día cambiado.
   */
  it('las 8 de la noche del lunes siguen siendo lunes, aunque en UTC ya sea martes', () => {
    const cita = deLocalAUtc(2026, 8, 31, 20 * 60)

    expect(cita.toISOString()).toBe('2026-09-01T01:00:00.000Z')
    expect(cita.getUTCDate()).toBe(1) // en UTC ya es otro día...
    expect(diaDeLaSemana(cita)).toBe('LUNES') // ...pero para la red es lunes
    expect(partesLocales(cita).day).toBe(31)
    expect(minutosDelDia(cita)).toBe(20 * 60)
    expect(enPalabras(cita)).toContain('lunes')
    expect(enPalabras(cita)).toContain('31 de agosto')
  })

  /** Y al revés: la madrugada en UTC todavía es la tarde anterior en Bogotá. */
  it('la medianoche de Bogotá no se adelanta ni se atrasa un día', () => {
    const medianoche = deLocalAUtc(2026, 8, 31, 0)

    expect(medianoche.toISOString()).toBe('2026-08-31T05:00:00.000Z')
    expect(partesLocales(medianoche).day).toBe(31)
    expect(partesLocales(medianoche).hour).toBe(0)
    expect(minutosDelDia(medianoche)).toBe(0)
  })

  /**
   * Un día que en UTC ya cambió de mes. Fin de mes por la noche es donde se
   * rompen las conversiones hechas a mano.
   */
  it('el último día del mes por la noche no salta de mes', () => {
    const cita = deLocalAUtc(2026, 8, 31, 22 * 60)
    const p = partesLocales(cita)

    expect(cita.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(p.month).toBe(8)
    expect(p.day).toBe(31)
  })

  /**
   * Ida y vuelta: lo que se guarda se vuelve a leer igual. Es la propiedad que
   * de verdad importa — que la hora que eligió la persona sea la hora a la que
   * el profesional se conecta.
   */
  it('lo que se guarda se vuelve a leer igual, hora a hora', () => {
    for (const minutos of [0, 6 * 60, 12 * 60, 13 * 60 + 45, 18 * 60 + 30, 23 * 60 + 59]) {
      const instante = deLocalAUtc(2026, 8, 31, minutos)
      expect(minutosDelDia(instante)).toBe(minutos)
      expect(partesLocales(instante).day).toBe(31)
    }
  })

  /** Los dos formateadores leen la misma hora: uno para máquinas, otro para gente. */
  it('el formato de máquina y el legible cuentan lo mismo', () => {
    const cita = deLocalAUtc(2026, 8, 31, 15 * 60 + 30)

    expect(formatearLocal(cita)).toBe('2026-08-31 15:30')
    expect(enPalabras(cita)).toBe('lunes, 31 de agosto, 3:30 p. m.')
  })
})
