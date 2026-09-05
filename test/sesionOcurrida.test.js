import { describe, it, expect } from 'vitest'
import {
  huboSesion,
  esperandoCierre,
  REPORTE_CONFIRMA,
  REPORTE_NIEGA,
} from '../src/services/appointmentState.service.js'

const HORA = 3600000
const ahora = Date.parse('2026-08-31T20:00:00.000Z')
const CASO = 'asignacion-1'

const cita = (extra) => ({
  status: 'CONFIRMADA',
  startsAt: new Date(ahora - 2 * HORA),
  caseAssignmentId: CASO,
  ...extra,
})

/** Un reporte del profesional, escrito después de la sesión. */
const reporte = (outcome, { caso = CASO, horasDespues = 1 } = {}) => ({
  outcome,
  assignmentId: caso,
  createdAt: new Date(ahora - 2 * HORA + horasDespues * HORA),
})

const ambosDentro = {
  patientFirstJoinedAt: new Date(ahora - 2 * HORA),
  professionalFirstJoinedAt: new Date(ahora - 2 * HORA),
}

/**
 * Quién sabe si hubo sesión, en orden: el profesional que estuvo ahí, después
 * la casilla del portal, y en último lugar el rastro de la sala.
 *
 * Medirlo solo por REALIZADA era medir la memoria de quien coordina: el
 * informe decía «0 sesiones» con doce llamadas con telemetría al lado.
 */
describe('lo que dice el profesional manda', () => {
  it('«ya la acompañé» cuenta como sesión aunque nadie marcara nada', () => {
    expect(huboSesion(cita(), [reporte(REPORTE_CONFIRMA)])).toBe(true)
  })

  /**
   * Y en la otra dirección: si el profesional dice que no se presentó, no hubo
   * sesión por mucho que la telemetría diga que las dos entraron. Puede que
   * alguien asomara la cabeza a la sala; quien estuvo ahí sabe qué pasó.
   */
  it('«no se presentó» pesa más que el rastro de la sala', () => {
    expect(huboSesion(cita(ambosDentro), [reporte(REPORTE_NIEGA)])).toBe(false)
  })

  it('y más que la casilla marcada como realizada', () => {
    expect(huboSesion(cita({ status: 'REALIZADA' }), [reporte(REPORTE_NIEGA)])).toBe(false)
  })

  it('un reporte de otro caso no dice nada de esta cita', () => {
    expect(huboSesion(cita(), [reporte(REPORTE_CONFIRMA, { caso: 'otro-caso' })])).toBe(false)
  })

  /**
   * Los reportes cuelgan del caso, no de la cita. Uno escrito ANTES de que
   * empezara la sesión cierra otra cosa —una llamada de contacto, la sesión
   * anterior— y no puede darla por ocurrida.
   */
  it('un reporte anterior a la sesión no la cierra', () => {
    expect(huboSesion(cita(), [reporte(REPORTE_CONFIRMA, { horasDespues: -1 })])).toBe(false)
  })
})

describe('cuando el profesional no ha reportado', () => {
  it('la casilla del portal decide', () => {
    expect(huboSesion(cita({ status: 'REALIZADA' }))).toBe(true)
    expect(huboSesion(cita({ status: 'NO_ASISTIO' }))).toBe(false)
    expect(huboSesion(cita({ status: 'CANCELADA' }))).toBe(false)
  })

  /**
   * El rastro de la sala es el último recurso, y a propósito: depende de que
   * la pestaña siguiera abierta. Sirve para no perder sesiones que ocurrieron
   * y nadie cerró; no para contradecir a nadie.
   */
  it('si no hay casilla, vale que entraran los dos', () => {
    expect(huboSesion(cita(ambosDentro))).toBe(true)
  })

  it('con uno solo dentro no basta', () => {
    expect(huboSesion(cita({ patientFirstJoinedAt: new Date() }))).toBe(false)
    expect(huboSesion(cita({ professionalFirstJoinedAt: new Date() }))).toBe(false)
  })

  it('una cita futura sin nadie dentro no es una sesión', () => {
    expect(huboSesion(cita({ startsAt: new Date(ahora + 5 * HORA) }))).toBe(false)
  })
})

describe('cierres pendientes', () => {
  it('pasó la hora y no hay reporte, ni casilla, ni rastro: espera cierre', () => {
    expect(esperandoCierre(cita(), [], ahora)).toBe(true)
  })

  it('con el reporte del profesional ya no espera nada', () => {
    expect(esperandoCierre(cita(), [reporte(REPORTE_CONFIRMA)], ahora)).toBe(false)
    expect(esperandoCierre(cita(), [reporte(REPORTE_NIEGA)], ahora)).toBe(false)
  })

  it('con la casilla marcada tampoco', () => {
    expect(esperandoCierre(cita({ status: 'REALIZADA' }), [], ahora)).toBe(false)
    expect(esperandoCierre(cita({ status: 'CANCELADA' }), [], ahora)).toBe(false)
  })

  it('una cita que todavía no llega no es deuda', () => {
    expect(esperandoCierre(cita({ startsAt: new Date(ahora + 5 * HORA) }), [], ahora)).toBe(false)
  })
})

/**
 * UN REPORTE CIERRA UNA SESIÓN, NO TODAS LAS ANTERIORES.
 *
 * El caso real: Estivalys escribió el 2 de septiembre a las 7:56 p. m. «se
 * reprograma la cita de hoy». El portal se lo colgó también a la sesión del
 * 29 de agosto, que quedó en un limbo: sin contar como sesión, y sin salir en
 * «Lo que está esperando» porque el sistema la creía cerrada con un reporte
 * que hablaba de otra fecha.
 *
 * La regla es que un reporte cierra la sesión más reciente que ya había
 * empezado cuando se escribió. Para saberlo hay que pasar las citas del caso:
 * sin ellas se trata como si esta fuera la última, que es lo que hacía antes.
 */
describe('un reporte no se lo quedan dos sesiones', () => {
  const primera = cita({ startsAt: new Date(ahora - 96 * HORA) })
  const segunda = cita({ startsAt: new Date(ahora - 2 * HORA) })
  const citas = [primera, segunda]
  // Escrito una hora después de la SEGUNDA: es de esa.
  const tardio = { outcome: REPORTE_CONFIRMA, assignmentId: CASO, createdAt: new Date(ahora - HORA) }

  it('el reporte tardío cierra la última, no la vieja', () => {
    expect(huboSesion(segunda, [tardio], citas)).toBe(true)
    expect(huboSesion(primera, [tardio], citas)).toBe(false)
  })

  it('y la vieja vuelve a salir como pendiente de cerrar', () => {
    // Sin las hermanas se la creía cerrada: ese era el limbo.
    expect(esperandoCierre(primera, [tardio], ahora)).toBe(false)
    expect(esperandoCierre(primera, [tardio], ahora, citas)).toBe(true)
  })

  it('cada sesión con su reporte cuando hay uno para cada una', () => {
    const deLaPrimera = {
      outcome: REPORTE_NIEGA,
      assignmentId: CASO,
      createdAt: new Date(ahora - 95 * HORA),
    }
    expect(huboSesion(primera, [deLaPrimera, tardio], citas)).toBe(false)
    expect(huboSesion(segunda, [deLaPrimera, tardio], citas)).toBe(true)
  })

  it('con una sola sesión, el reporte es suyo aunque llegue tarde', () => {
    expect(huboSesion(segunda, [tardio], [segunda])).toBe(true)
  })

  it('una sesión de otro caso no le quita el reporte a esta', () => {
    const deOtroCaso = cita({ startsAt: new Date(ahora - HORA), caseAssignmentId: 'otro-caso' })
    expect(huboSesion(segunda, [tardio], [...citas, deOtroCaso])).toBe(true)
  })
})
