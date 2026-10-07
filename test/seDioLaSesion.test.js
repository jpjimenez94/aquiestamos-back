import { describe, it, expect } from 'vitest'
import { huboSesion } from '../src/services/appointmentState.service.js'
import { caseReportCreateSchema, SESION_IMPLICITA } from '../src/validators/caseReport.schema.js'

/**
 * «¿Se dio la sesión?» aparte de «¿qué sigue?».
 *
 * El reporte del profesional admitía UNA respuesta, y el caso más común de
 * todos —la acompañé y de paso quedamos en la siguiente— obligaba a elegir.
 * Se elegía «quedamos en una cita», y la sesión recién dada no la contaba
 * nadie: ni el informe, ni el cierre automático, ni el tablero.
 *
 * Se vio con números. En la semana del 29 de septiembre de 2026 hubo 21 citas;
 * el informe dijo 6 sesiones. De los 14 reportes de esa semana, 9 dijeron
 * «quedamos en una cita» y solo 3 «ya la acompañé», y quedaron 10 citas
 * pasadas sin cerrar. No era que nadie trabajara: era que el formulario no
 * dejaba decir lo que había pasado.
 */

const CITA = {
  id: 'cita-1',
  status: 'CONFIRMADA',
  startsAt: new Date('2026-09-29T14:00:00Z'),
  caseAssignmentId: 'asig-1',
  patientFirstJoinedAt: null,
  professionalFirstJoinedAt: null,
}

/** Un reporte escrito justo después de esa cita. */
const reporte = (campos) => [
  {
    assignmentId: 'asig-1',
    createdAt: new Date('2026-09-29T15:30:00Z'),
    outcome: 'CITA_ACORDADA',
    sessionHeld: null,
    ...campos,
  },
]

const CITAS_DEL_CASO = [{ startsAt: CITA.startsAt, caseAssignmentId: 'asig-1' }]

describe('la sesión que se perdía', () => {
  /** El caso exacto que hundía la cifra. */
  it('«quedamos en una cita» ya no borra la sesión que acababa de darse', () => {
    expect(huboSesion(CITA, reporte({ sessionHeld: true }), CITAS_DEL_CASO)).toBe(true)
  })

  it('y si solo hablaron para cuadrar, sigue sin contar', () => {
    expect(huboSesion(CITA, reporte({ sessionHeld: false }), CITAS_DEL_CASO)).toBe(false)
  })

  /**
   * Los reportes viejos no tienen la respuesta, y eso no se inventa: se cae a
   * las señales de antes, que es como se contaban hasta ahora.
   */
  it('un reporte de antes de la pregunta se sigue leyendo como antes', () => {
    expect(huboSesion(CITA, reporte({ sessionHeld: null }), CITAS_DEL_CASO)).toBe(false)
    expect(
      huboSesion(CITA, reporte({ sessionHeld: null, outcome: 'YA_ATENDIDA' }), CITAS_DEL_CASO),
    ).toBe(true)
  })

  /** La respuesta directa manda sobre todo lo demás, incluida la casilla. */
  it('lo que dice quien estuvo ahí vale más que la casilla del portal', () => {
    const marcadaRealizada = { ...CITA, status: 'REALIZADA' }
    expect(huboSesion(marcadaRealizada, reporte({ sessionHeld: false }), CITAS_DEL_CASO)).toBe(false)
  })
})

describe('el formulario del profesional', () => {
  const base = {
    outcome: 'CITA_ACORDADA',
    modality: 'VIRTUAL',
    meetsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  }

  it('no deja mandar «quedamos en una cita» sin decir si hubo sesión', () => {
    const r = caseReportCreateSchema.safeParse(base)
    expect(r.success).toBe(false)
    expect(r.error.issues.some((i) => i.path.includes('sessionHeld'))).toBe(true)
  })

  it('pasa cuando sí lo dice', () => {
    expect(caseReportCreateSchema.safeParse({ ...base, sessionHeld: true }).success).toBe(true)
    expect(caseReportCreateSchema.safeParse({ ...base, sessionHeld: false }).success).toBe(true)
  })

  /**
   * El formulario manda cadenas, y `z.coerce.boolean()` convierte "false" en
   * `true` —toda cadena no vacía es verdadera—. Con eso, un profesional que
   * dice que NO hubo sesión habría quedado registrado diciendo que sí.
   */
  it('«false» como texto sigue siendo no', () => {
    const r = caseReportCreateSchema.safeParse({ ...base, sessionHeld: 'false' })
    expect(r.success).toBe(true)
    expect(r.data.sessionHeld).toBe(false)
  })

  /** A quien ya dijo «ya la acompañé» no se le vuelve a preguntar. */
  it('no se pregunta lo que el propio resultado ya contesta', () => {
    expect(SESION_IMPLICITA.YA_ATENDIDA).toBe(true)
    expect(SESION_IMPLICITA.NO_ASISTIO).toBe(false)

    const atendida = caseReportCreateSchema.safeParse({
      outcome: 'YA_ATENDIDA',
      modality: 'VIRTUAL',
      followUp: 'SUFICIENTE',
    })
    expect(atendida.success).toBe(true)
  })

  /** Y a quien dice que el número está mal, tampoco. */
  it('a quien no logró contactarla no se le pregunta por una sesión', () => {
    expect(caseReportCreateSchema.safeParse({ outcome: 'DATOS_ERRADOS' }).success).toBe(true)
  })
})
