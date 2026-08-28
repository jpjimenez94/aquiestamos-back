import { describe, it, expect } from 'vitest'
import { cita } from '../src/views/appointment.view.js'

/**
 * El semáforo de la sala y el tiempo en videollamada.
 *
 * Los dos se quedaban en blanco con las dos personas dentro: «0 min» y ningún
 * «En vivo ahora». La causa estaba en la pantalla de la sala —el efecto que
 * manda los latidos se remontaba cada segundo y el intervalo nunca llegaba a
 * disparar— pero la ventana de tolerancia de aquí lo empeoraba: 60 segundos,
 * justo el filo al que el navegador estrangula los temporizadores de una
 * pestaña de fondo, que es donde queda esta pantalla al abrirse Jitsi aparte.
 *
 * Nada de esto estaba probado. Y es de lo que falla callado: la sesión ocurre
 * igual, solo que coordinación la ve como si no estuviera pasando.
 */

const base = {
  id: 'c1',
  startsAt: new Date('2026-08-31T14:00:00Z'),
  endsAt: new Date('2026-08-31T14:45:00Z'),
  status: 'PROGRAMADA',
  modality: 'VIRTUAL',
}

const conLatidos = (segundosPaciente, segundosProfesional) => ({
  ...base,
  accessLogs: [
    { role: 'PACIENTE', lastPingAt: new Date(Date.now() - segundosPaciente * 1000) },
    { role: 'PROFESIONAL', lastPingAt: new Date(Date.now() - segundosProfesional * 1000) },
  ],
})

describe('quién está en vivo en la sala', () => {
  it('con latidos recientes, los dos están en vivo', () => {
    const v = cita(conLatidos(5, 5))
    expect(v.pacienteEnVivo).toBe(true)
    expect(v.profesionalEnVivo).toBe(true)
    expect(v.ambosEnVivo).toBe(true)
  })

  /**
   * El caso que apagaba el semáforo. La pestaña de la sala queda de fondo
   * cuando se abre Jitsi, y ahí el navegador estrangula el latido a uno por
   * minuto. Con la ventana en 60 segundos, un latido a los 70 —normal bajo
   * estrangulamiento— decía que la persona se había ido.
   */
  it('un latido estrangulado a 70 segundos NO cuenta como desconexión', () => {
    const v = cita(conLatidos(70, 70))
    expect(v.pacienteEnVivo).toBe(true)
    expect(v.profesionalEnVivo).toBe(true)
  })

  it('aguanta dos latidos estrangulados seguidos', () => {
    expect(cita(conLatidos(130, 130)).pacienteEnVivo).toBe(true)
  })

  /** Pero un silencio largo sí es una salida: la tolerancia tiene tope. */
  it('a los cuatro minutos sin latir, se da por desconectado', () => {
    const v = cita(conLatidos(4 * 60, 4 * 60))
    expect(v.pacienteEnVivo).toBe(false)
    expect(v.profesionalEnVivo).toBe(false)
    expect(v.llamadaEnVivo).toBe(false)
  })

  it('uno dentro y otro fuera se distinguen', () => {
    const v = cita(conLatidos(5, 10 * 60))
    expect(v.pacienteEnVivo).toBe(true)
    expect(v.profesionalEnVivo).toBe(false)
    expect(v.llamadaEnVivo).toBe(true)
    expect(v.ambosEnVivo).toBe(false)
  })

  it('sin nadie que haya entrado, nadie está en vivo', () => {
    const v = cita({ ...base, accessLogs: [] })
    expect(v.pacienteEnVivo).toBe(false)
    expect(v.llamadaEnVivo).toBe(false)
  })
})

describe('el tiempo en videollamada', () => {
  it('se dice en segundos y en minutos', () => {
    const v = cita({ ...base, accessLogs: [], totalCallDurationSeconds: 8 * 60 + 30 })
    expect(v.totalCallDurationSeconds).toBe(510)
    expect(v.totalCallDurationMinutes).toBe(9)
  })

  /**
   * Cero es cero, no null: la pantalla imprime «0 min» y necesita un número.
   * Con undefined salía «min» a secas.
   */
  it('sin telemetría todavía, es 0 y no un hueco', () => {
    const v = cita({ ...base, accessLogs: [] })
    expect(v.totalCallDurationSeconds).toBe(0)
    expect(v.totalCallDurationMinutes).toBe(0)
  })
})
