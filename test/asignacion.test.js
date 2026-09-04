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
   * Desde ACEPTADA se agenda, se declina o se cancela.
   *
   * Aquí se afirmaba lo contrario —que declinar desde ACEPTADA no valía— y
   * tenía sentido cuando ACEPTADA significaba «ya dijo que sí»: volver a
   * preguntarle no era un paso atrás, era otra asignación.
   *
   * Dejó de tenerlo cuando la asignación pasó a NACER ahí. El profesional ya no
   * dice que sí: se le asigna y se le avisa. Con la regla vieja, el mensaje le
   * prometía «si no puedes, dilo ahí mismo» y no había ahí mismo — la única
   * salida vivía en PROPUESTA, un estado por el que ya no pasa nadie.
   *
   * Esta prueba estaba en verde mientras el profesional no podía negarse.
   * Por eso se cambia y no se borra: es la línea que marca cuándo se le
   * devolvió esa puerta.
   */
  it('una vez asignada, se agenda, se declina o se cancela', () => {
    expect(transicionesDesde(ESTADOS.ACEPTADA).sort()).toEqual(
      ['ACTIVA', 'CANCELADA', 'RECHAZADA'].sort(),
    )
    expect(puedeTransicionar(ESTADOS.ACEPTADA, ESTADOS.RECHAZADA)).toBe(true)

    // Volver a PROPUESTA sigue sin valer: eso sería otra asignación.
    expect(puedeTransicionar(ESTADOS.ACEPTADA, ESTADOS.PROPUESTA)).toBe(false)
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
  /**
   * Aceptar es un toque.
   *
   * Aquí se afirmaba lo contrario: que aceptar sin decir días ni franjas
   * debía fallar, porque «deja el caso igual de parado que no aceptar». Esa
   * regla se fue con los campos.
   *
   * El profesional ya nos dio su agenda al registrarse —los 48 asignables la
   * tienen— y es de ahí de donde la persona elige su hora. Pedírsela otra vez
   * era pedirle dos veces lo mismo, y encima en el paso donde se perdían siete
   * de cada ocho asignaciones. El caso ya no se queda parado esperando esos
   * datos: se queda parado si él no contesta, y para eso está el plazo.
   */
  it('aceptar no pide nada más: su agenda ya está cargada', () => {
    expect(respuestaPropuestaSchema.safeParse({ acepta: true }).success).toBe(true)
  })

  it('la nota sigue, para el matiz que una agenda no dice', () => {
    const r = respuestaPropuestaSchema.safeParse({
      acepta: true,
      nota: 'Después de las 4 mejor',
    })
    expect(r.success).toBe(true)
    expect(r.data.nota).toBe('Después de las 4 mejor')
  })

  /**
   * Decir que no no cuesta una explicación.
   *
   * El motivo era obligatorio, y contradecía al mensaje que le trae hasta aquí:
   * «no pasa nada, es voluntario, decirlo pronto ayuda más que un sí que no
   * llega». Cobrarle una justificación es poner el peaje justo delante de la
   * conducta que le pedimos — y quien no quiere explicarse no escribe «no puedo
   * y ya»: cierra la pestaña, y nos quedamos sin motivo Y sin respuesta.
   *
   * El campo se queda porque saber por qué distingue un problema del caso de
   * uno de la red. Lo que se va es la exigencia.
   */
  it('deja rechazar sin decir por qué, y acepta el motivo si lo da', () => {
    expect(respuestaPropuestaSchema.safeParse({ acepta: false }).success).toBe(true)
    expect(respuestaPropuestaSchema.safeParse({ acepta: false, motivo: '' }).success).toBe(true)
    expect(
      respuestaPropuestaSchema.safeParse({ acepta: false, motivo: 'Me queda muy lejos' }).success,
    ).toBe(true)
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

describe('lo que el profesional ofreció para el caso', () => {
  /**
   * La agenda del perfil puede estar vieja; lo que respondió al aceptar no.
   * Si la cita cae en lo que él ofreció, no hay nada que confirmar a mano.
   * Las horas son de Bogotá: el 26-08-2026 es miércoles y las 7 p. m. caen
   * en la franja NOCHE (6 a 9).
   */
  it('la cita del miércoles a las 7 p. m. cae en «miércoles en la noche»', async () => {
    const { dentroDeLoOfrecido } = await import('../src/services/scheduling.service.js')
    expect(
      dentroDeLoOfrecido({
        dias: ['MIERCOLES'],
        franjas: ['NOCHE'],
        inicio: new Date('2026-08-27T00:00:00Z'), // mié 7:00 p. m. en Bogotá
        fin: new Date('2026-08-27T00:45:00Z'),
      }),
    ).toBe(true)
  })

  it('el lunes en la mañana NO cae en «miércoles en la noche»', async () => {
    const { dentroDeLoOfrecido } = await import('../src/services/scheduling.service.js')
    expect(
      dentroDeLoOfrecido({
        dias: ['MIERCOLES'],
        franjas: ['NOCHE'],
        inicio: new Date('2026-08-24T14:00:00Z'), // lun 9:00 a. m. en Bogotá
        fin: new Date('2026-08-24T14:45:00Z'),
      }),
    ).toBe(false)
  })

  it('si solo dio días, cualquier hora de esos días cuenta', async () => {
    const { dentroDeLoOfrecido } = await import('../src/services/scheduling.service.js')
    expect(
      dentroDeLoOfrecido({
        dias: ['MIERCOLES'],
        franjas: [],
        inicio: new Date('2026-08-26T14:00:00Z'), // mié 9:00 a. m. en Bogotá
        fin: new Date('2026-08-26T14:45:00Z'),
      }),
    ).toBe(true)
  })

  it('si no dio nada, no ofreció nada: la casilla sigue mandando', async () => {
    const { dentroDeLoOfrecido } = await import('../src/services/scheduling.service.js')
    expect(
      dentroDeLoOfrecido({
        dias: [],
        franjas: [],
        inicio: new Date('2026-08-27T00:00:00Z'),
        fin: new Date('2026-08-27T00:45:00Z'),
      }),
    ).toBe(false)
  })

  it('la oferta se puede decir en palabras para el mensaje de error', async () => {
    const { ofertaEnPalabras } = await import('../src/services/scheduling.service.js')
    expect(ofertaEnPalabras(['MIERCOLES'], ['NOCHE'])).toBe('miércoles en la noche')
    expect(ofertaEnPalabras([], [])).toBeNull()
  })
})
