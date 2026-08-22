import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { calcularPrioridad, exigeAvisoInmediato } from '../src/services/triage.service.js'
import { crearEnlaceTamizaje, leerEnlaceTamizaje } from '../src/auth/enlaceTamizaje.js'
import {
  prioridadPorSilencio,
  toca,
  DIAS_SIN_RESPUESTA,
} from '../src/services/promotion.service.js'
import { triageResponseSchema } from '../src/validators/triage.schema.js'

/**
 * El tamizaje decide con qué prioridad entra alguien a la cola. Si estas
 * reglas se mueven sin querer, la consecuencia no es un error en pantalla: es
 * que alguien que necesitaba atención hoy queda detrás de quien podía esperar.
 */

/** Alguien que está bien: sirve de base para mover una respuesta a la vez. */
const bien = {
  safePlace: true,
  distress: 1,
  sleepAndEat: 'SI',
  dailyFunction: 'SI',
  hasSupport: true,
  selfHarmThoughts: false,
  howSoon: 'PUEDO_ESPERAR',
  availableDays: ['MARTES'],
  availableSlots: ['TARDE'],
  preferredModality: 'VIRTUAL',
  sensitiveDataConsent: true,
}

describe('prioridad a partir del tamizaje', () => {
  it('sin ninguna señal, es baja', () => {
    expect(calcularPrioridad(bien).prioridad).toBe('BAJA')
  })

  /**
   * La regla más importante de todo el archivo. Si esta prueba falla, alguien
   * que dijo que ha pensado en hacerse daño está entrando a la cola detrás de
   * otro que dijo que puede esperar.
   */
  it('la pregunta de riesgo manda a ALTA ella sola, con todo lo demás bien', () => {
    const r = calcularPrioridad({ ...bien, selfHarmThoughts: true })
    expect(r.prioridad).toBe('ALTA')
    expect(r.razones[0]).toContain('hacerse daño')
  })

  it('no estar en un lugar seguro manda a ALTA', () => {
    expect(calcularPrioridad({ ...bien, safePlace: false }).prioridad).toBe('ALTA')
  })

  it('la intensidad máxima manda a ALTA', () => {
    expect(calcularPrioridad({ ...bien, distress: 5 }).prioridad).toBe('ALTA')
  })

  it('intensidad 4 es media sola, y alta si además no puede con el día', () => {
    expect(calcularPrioridad({ ...bien, distress: 4 }).prioridad).toBe('MEDIA')
    expect(
      calcularPrioridad({ ...bien, distress: 4, dailyFunction: 'NO' }).prioridad,
    ).toBe('ALTA')
  })

  it('pedir ayuda para hoy manda a ALTA', () => {
    expect(calcularPrioridad({ ...bien, howSoon: 'HOY' }).prioridad).toBe('ALTA')
  })

  it('las señales intermedias dejan el caso en MEDIA', () => {
    expect(calcularPrioridad({ ...bien, distress: 3 }).prioridad).toBe('MEDIA')
    expect(calcularPrioridad({ ...bien, sleepAndEat: 'NO' }).prioridad).toBe('MEDIA')
    expect(calcularPrioridad({ ...bien, dailyFunction: 'CON_DIFICULTAD' }).prioridad).toBe('MEDIA')
    expect(calcularPrioridad({ ...bien, howSoon: 'ESTA_SEMANA' }).prioridad).toBe('MEDIA')
    expect(calcularPrioridad({ ...bien, hasSupport: false }).prioridad).toBe('MEDIA')
  })

  it('en un menor de edad, MEDIA sube a ALTA', () => {
    const respuestas = { ...bien, distress: 3 }
    expect(calcularPrioridad(respuestas).prioridad).toBe('MEDIA')

    const menor = calcularPrioridad(respuestas, { esMenor: true })
    expect(menor.prioridad).toBe('ALTA')
    expect(menor.razones.join(' ')).toContain('menor de edad')
  })

  it('un menor que está bien sigue siendo BAJA: la regla sube MEDIA, no inventa señales', () => {
    expect(calcularPrioridad(bien, { esMenor: true }).prioridad).toBe('BAJA')
  })

  it('siempre explica por qué, para que quien admite pueda contradecirlo', () => {
    for (const respuestas of [bien, { ...bien, distress: 3 }, { ...bien, selfHarmThoughts: true }]) {
      expect(calcularPrioridad(respuestas).razones.length).toBeGreaterThan(0)
    }
  })

  it('pide aviso inmediato solo cuando hay riesgo o falta lo básico', () => {
    expect(exigeAvisoInmediato(bien)).toBe(false)
    expect(exigeAvisoInmediato({ ...bien, distress: 5 })).toBe(false)
    expect(exigeAvisoInmediato({ ...bien, selfHarmThoughts: true })).toBe(true)
    expect(exigeAvisoInmediato({ ...bien, safePlace: false })).toBe(true)
  })
})

describe('enlace del tamizaje', () => {
  const solicitud = '11111111-2222-3333-4444-555555555555'

  it('lo que se firma es lo que se lee', () => {
    const datos = leerEnlaceTamizaje(crearEnlaceTamizaje(solicitud))
    expect(datos.solicitud).toBe(solicitud)
    expect(datos.tipo).toBe('tamizaje')
  })

  it('un token con la firma cambiada no vale', () => {
    const token = crearEnlaceTamizaje(solicitud)
    expect(leerEnlaceTamizaje(token.slice(0, -1) + '0')).toBeNull()
  })

  it('un token con el cuerpo cambiado no vale', () => {
    const token = crearEnlaceTamizaje(solicitud)
    const [, firma] = token.split('.')
    const otroCuerpo = Buffer.from(
      JSON.stringify({ tipo: 'tamizaje', solicitud: 'otra', vence: Date.now() + 1000 }),
    ).toString('base64url')
    expect(leerEnlaceTamizaje(`${otroCuerpo}.${firma}`)).toBeNull()
  })

  it('rechaza cualquier cosa que no sea un token', () => {
    for (const basura of [null, undefined, '', 'a', 'sin-punto', '.', 'x'.repeat(3000)]) {
      expect(leerEnlaceTamizaje(basura)).toBeNull()
    }
  })

  /**
   * Los dos enlaces públicos del sistema firman con el mismo secreto. Lo único
   * que impide que uno sirva para la puerta del otro es el campo `tipo`. Si
   * alguien lo quita, esta prueba tiene que fallar.
   */
  it('un token sin tipo —como el del caso compartido— no abre el tamizaje', () => {
    const cuerpo = Buffer.from(
      JSON.stringify({ paciente: solicitud, profesional: 'x', vence: Date.now() + 100000 }),
    ).toString('base64url')
    const firma = createHmac('sha256', 'secreto-solo-para-pruebas').update(cuerpo).digest('hex')
    expect(leerEnlaceTamizaje(`${cuerpo}.${firma}`)).toBeNull()
  })
})

describe('validación de las respuestas', () => {
  it('acepta un tamizaje completo', () => {
    expect(triageResponseSchema.safeParse(bien).success).toBe(true)
  })

  it('sin autorización no se guarda: son datos de salud', () => {
    const r = triageResponseSchema.safeParse({ ...bien, sensitiveDataConsent: false })
    expect(r.success).toBe(false)
  })

  it('la intensidad tiene que estar entre 1 y 5', () => {
    for (const distress of [0, 6, -1, 2.5]) {
      expect(triageResponseSchema.safeParse({ ...bien, distress }).success).toBe(false)
    }
  })

  it('ninguna pregunta es opcional', () => {
    for (const campo of Object.keys(bien)) {
      const incompleto = { ...bien }
      delete incompleto[campo]
      expect(triageResponseSchema.safeParse(incompleto).success).toBe(false)
    }
  })

  /**
   * La disponibilidad es obligatoria AQUÍ aunque en el formulario público sea
   * opcional. Esa es la razón de haberla movido: allá no la llenaba nadie —de
   * cinco solicitudes, cinco sin días— y el profesional recibía la propuesta
   * sin más dato que la ciudad.
   */
  it('exige decir cuándo puede: es el dato que decide a quién proponérselo', () => {
    expect(triageResponseSchema.safeParse({ ...bien, availableDays: [] }).success).toBe(false)
    expect(triageResponseSchema.safeParse({ ...bien, availableSlots: [] }).success).toBe(false)
    const sinModalidad = { ...bien }
    delete sinModalidad.preferredModality
    expect(triageResponseSchema.safeParse(sinModalidad).success).toBe(false)
  })

  it('acepta varios días y varias franjas', () => {
    const r = triageResponseSchema.safeParse({
      ...bien,
      availableDays: ['LUNES', 'MIERCOLES', 'SABADO'],
      availableSlots: ['MANANA', 'NOCHE'],
    })
    expect(r.success).toBe(true)
  })

  it('no se cuela una opción que no está en la lista', () => {
    expect(triageResponseSchema.safeParse({ ...bien, howSoon: 'AHORA_MISMO' }).success).toBe(false)
    expect(triageResponseSchema.safeParse({ ...bien, sleepAndEat: 'QUIZAS' }).success).toBe(false)
    expect(triageResponseSchema.safeParse({ ...bien, availableDays: ['LUNESITO'] }).success).toBe(false)
    expect(triageResponseSchema.safeParse({ ...bien, preferredModality: 'TELEPATIA' }).success).toBe(false)
  })
})

/**
 * El rescate de quien nunca responde.
 *
 * Desde que la admisión la dispara el tamizaje, entrar a la cola depende de
 * que la persona abra un enlace. Quien está peor es justamente quien menos
 * probable es que lo haga, así que esto no es una comodidad: es lo que evita
 * que alguien pida ayuda y el sistema no la ponga en ninguna parte.
 */
describe('rescate de solicitudes sin respuesta', () => {
  const ahora = new Date('2026-08-22T12:00:00Z')
  const haceDias = (d) => ({ createdAt: new Date(ahora.getTime() - d * 86400000) })

  it('no toca lo que acaba de llegar', () => {
    expect(toca(haceDias(0), { ahora })).toBe(false)
    expect(toca(haceDias(1), { ahora })).toBe(false)
  })

  it('toca a partir del umbral, y sigue tocando después', () => {
    expect(toca(haceDias(2), { ahora })).toBe(true)
    expect(toca(haceDias(9), { ahora })).toBe(true)
  })

  it('el umbral se puede mover', () => {
    expect(toca(haceDias(3), { ahora, dias: 5 })).toBe(false)
    expect(toca(haceDias(6), { ahora, dias: 5 })).toBe(true)
  })

  it('el umbral por defecto son dos días', () => {
    expect(DIAS_SIN_RESPUESTA).toBe(2)
  })

  /**
   * MEDIA y no BAJA: poner en BAJA a quien no contestó sería decidir que puede
   * esperar sin que nadie lo haya comprobado. Y no ALTA, porque llenar la cola
   * de urgencias supuestas vuelve inútil la etiqueta para las de verdad.
   */
  it('quien no responde entra en MEDIA', () => {
    expect(prioridadPorSilencio({ isMinor: false })).toBe('MEDIA')
    expect(prioridadPorSilencio({ isMinor: null })).toBe('MEDIA')
    expect(prioridadPorSilencio({})).toBe('MEDIA')
  })

  it('en un menor de edad sube a ALTA, igual que en el tamizaje', () => {
    expect(prioridadPorSilencio({ isMinor: true })).toBe('ALTA')
  })
})
