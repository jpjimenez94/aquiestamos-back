import { describe, it, expect } from 'vitest'
import { caseReportCreateSchema } from '../src/validators/caseReport.schema.js'

const HORA = 3600000
const base = { outcome: 'CITA_ACORDADA', modality: 'VIRTUAL' }

/**
 * «Quedamos en una cita» para un día que ya pasó no puede ser verdad.
 *
 * Una profesional escribió 9 de febrero queriendo decir 2 de septiembre —el
 * campo de fecha se ve en el orden que decida su navegador, y se teclea al
 * revés sin notarlo— y el reporte se guardó así. La ficha lo enseñó durante
 * días al lado de la cita real, y el botón de «agendar la cita acordada»
 * proponía esa fecha imposible.
 */
describe('la fecha de una cita acordada', () => {
  it('en el futuro, vale', () => {
    const r = caseReportCreateSchema.safeParse({ ...base, meetsAt: new Date(Date.now() + 24 * HORA).toISOString() })
    expect(r.success).toBe(true)
  })

  it('en el pasado, se rechaza con un mensaje que apunta al error típico', () => {
    const r = caseReportCreateSchema.safeParse({ ...base, meetsAt: new Date(Date.now() - 24 * HORA).toISOString() })
    expect(r.success).toBe(false)
    const mensaje = r.error.issues.find((i) => i.path[0] === 'meetsAt')?.message
    expect(mensaje).toMatch(/ya pasó/i)
    expect(mensaje).toMatch(/día y el mes/i)
  })

  it('sin fecha sigue pidiéndola, como antes', () => {
    const r = caseReportCreateSchema.safeParse(base)
    expect(r.success).toBe(false)
    expect(r.error.issues.some((i) => i.path[0] === 'meetsAt')).toBe(true)
  })

  /**
   * La regla es solo para citas acordadas. Un «ya la acompañé» puede llevar la
   * fecha de la sesión que ocurrió, y esa es pasada por definición.
   */
  it('no se aplica a los demás resultados', () => {
    const r = caseReportCreateSchema.safeParse({
      outcome: 'YA_ATENDIDA',
      modality: 'VIRTUAL',
      followUp: 'SUFICIENTE',
      meetsAt: new Date(Date.now() - 24 * HORA).toISOString(),
    })
    expect(r.success).toBe(true)
  })
})
