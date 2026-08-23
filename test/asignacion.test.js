import { describe, it, expect } from 'vitest'
import {
  ESTADOS,
  VIVOS,
  FINALES,
  transicionesDesde,
  puedeTransicionar,
  exigirTransicion,
  estaVivo,
} from '../src/services/assignmentState.service.js'
import { respuestaPropuestaSchema } from '../src/validators/propuesta.schema.js'

/**
 * Asignar dejó de ser un clic y pasó a ser una negociación entre tres. Estas
 * pruebas fijan los caminos que esa negociación puede tomar — y sobre todo,
 * los que no.
 */

describe('máquina de estados de la asignación', () => {
  it('nace propuesta y solo el profesional la mueve de ahí', () => {
    expect(transicionesDesde(ESTADOS.PROPUESTA).sort()).toEqual(
      ['ACEPTADA', 'CANCELADA', 'RECHAZADA'].sort(),
    )
  })

  /**
   * De ACEPTADA solo se sale agendando o cancelando. No se puede volver a
   * PROPUESTA: proponerle el caso otra vez a quien ya dijo que sí no es un
   * paso atrás, es otra asignación.
   */
  it('una vez aceptada, solo se agenda o se cancela', () => {
    expect(transicionesDesde(ESTADOS.ACEPTADA).sort()).toEqual(['ACTIVA', 'CANCELADA'].sort())
    expect(puedeTransicionar(ESTADOS.ACEPTADA, ESTADOS.PROPUESTA)).toBe(false)
    expect(puedeTransicionar(ESTADOS.ACEPTADA, ESTADOS.RECHAZADA)).toBe(false)
  })

  it('no se puede saltar de propuesta a activa sin que nadie acepte', () => {
    expect(puedeTransicionar(ESTADOS.PROPUESTA, ESTADOS.ACTIVA)).toBe(false)
  })

  it('los estados finales son finales', () => {
    for (const estado of FINALES) {
      expect(transicionesDesde(estado)).toEqual([])
    }
  })

  it('explica por qué no se puede, no solo que no se puede', () => {
    try {
      exigirTransicion(ESTADOS.RECHAZADA, ESTADOS.ACTIVA)
      throw new Error('debió lanzar')
    } catch (error) {
      expect(error.codigo).toBe('TRANSICION_INVALIDA')
      expect(error.message).toContain('no pudo')
    }
  })

  it('responder dos veces no es una transición válida', () => {
    expect(() => exigirTransicion(ESTADOS.ACEPTADA, ESTADOS.ACEPTADA)).toThrow()
  })

  /**
   * Esta lista la usan tres cosas a la vez: el índice único que impide
   * proponerle dos profesionales a la misma persona, el cupo de casos, y el
   * enlace del caso compartido. Si alguien saca PROPUESTA de aquí, se puede
   * proponer el mismo profesional a diez personas y todas «caben».
   */
  it('una propuesta cuenta como caso vivo, no solo el acompañamiento en curso', () => {
    expect(VIVOS).toEqual(['PROPUESTA', 'ACEPTADA', 'ACTIVA'])
    expect(estaVivo(ESTADOS.PROPUESTA)).toBe(true)
    expect(estaVivo(ESTADOS.RECHAZADA)).toBe(false)
    expect(estaVivo(ESTADOS.CERRADA)).toBe(false)
  })

  it('vivos y finales no se solapan y cubren todos los estados', () => {
    const todos = Object.values(ESTADOS).sort()
    expect([...VIVOS, ...FINALES].sort()).toEqual(todos)
  })
})

describe('la respuesta del profesional', () => {
  const aceptando = { acepta: true, dias: ['MARTES'], franjas: ['TARDE'] }

  it('acepta con días y franjas', () => {
    expect(respuestaPropuestaSchema.safeParse(aceptando).success).toBe(true)
  })

  /**
   * Aceptar sin decir cuándo deja el caso igual de parado que no aceptar, y
   * encima con quien coordina creyendo que avanzó.
   */
  it('no deja aceptar sin decir cuándo puede', () => {
    expect(respuestaPropuestaSchema.safeParse({ acepta: true, dias: [], franjas: ['TARDE'] }).success).toBe(false)
    expect(respuestaPropuestaSchema.safeParse({ acepta: true, dias: ['MARTES'], franjas: [] }).success).toBe(false)
  })

  /** Saber por qué no puede distingue un problema del caso de uno de la red. */
  it('no deja rechazar sin decir por qué', () => {
    expect(respuestaPropuestaSchema.safeParse({ acepta: false }).success).toBe(false)
    expect(
      respuestaPropuestaSchema.safeParse({ acepta: false, motivo: 'Me queda muy lejos' }).success,
    ).toBe(true)
  })

  it('rechazar no exige horarios: no los va a usar nadie', () => {
    const r = respuestaPropuestaSchema.safeParse({ acepta: false, motivo: 'Sin cupo este mes' })
    expect(r.success).toBe(true)
  })

  it('no se cuela un día ni una franja que no existan', () => {
    expect(
      respuestaPropuestaSchema.safeParse({ ...aceptando, dias: ['LUNESITO'] }).success,
    ).toBe(false)
    expect(
      respuestaPropuestaSchema.safeParse({ ...aceptando, franjas: ['MADRUGADA'] }).success,
    ).toBe(false)
  })

  it('decidir es obligatorio: no vale mandar el formulario en blanco', () => {
    expect(respuestaPropuestaSchema.safeParse({}).success).toBe(false)
  })
})

describe('las franjas del profesional, en palabras', () => {
  /**
   * El error de "fuera de franja" tiene que decir cuáles SÍ son las franjas.
   * Estas pruebas fijan el formato: día en palabras, hora de 12, orden de la
   * semana y no del enum.
   */
  it('convierte las reglas a algo que se pueda leer en un mensaje', async () => {
    const { describirFranjas } = await import('../src/services/scheduling.service.js')
    expect(
      describirFranjas([
        { weekday: 'MIERCOLES', startMinute: 840, endMinute: 1080 },
        { weekday: 'LUNES', startMinute: 480, endMinute: 720 },
      ]),
    ).toBe('lunes de 8:00 a. m. a 12:00 p. m., miércoles de 2:00 p. m. a 6:00 p. m.')
  })

  it('sin reglas devuelve null, para que el mensaje diga que no hay ninguna', async () => {
    const { describirFranjas } = await import('../src/services/scheduling.service.js')
    expect(describirFranjas([])).toBeNull()
    expect(describirFranjas(null)).toBeNull()
  })
})
