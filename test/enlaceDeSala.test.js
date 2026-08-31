import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { generarTokenSala, verificarTokenSala } from '../src/services/meeting.service.js'
import { env } from '../src/config/env.js'

/**
 * La llave de la sala de videollamada.
 *
 * Ocupaba 132 caracteres —base64 de un JSON con el id y el rol, más la firma—
 * mientras el resto de enlaces de la red ya usaban el formato compacto de 50.
 * Un enlace de sala viaja por WhatsApp a alguien que a veces lo abre desde un
 * teléfono con mala señal y a veces lo copia a mano: ochenta caracteres menos
 * es que quepa en una línea y no se parta en dos.
 *
 * Lo que hace peligroso este cambio no es generarlos: es que hay enlaces YA
 * ENVIADOS, guardados en conversaciones de WhatsApp de gente que tiene su cita
 * confirmada. Cortarlos sería dejar a alguien fuera de su propia sesión, y no
 * se enteraría hasta el momento de entrar.
 *
 * Por eso conviven tres formatos, y por eso están los tres aquí.
 */

const ID = '2ff81cec-34e5-499f-89a0-329815f20cc1'

/** Un token exactamente como los que ya circulan por ahí. */
function tokenDelFormatoAnterior(rol) {
  const payload = Buffer.from(JSON.stringify({ aid: ID, rol })).toString('base64url')
  const firma = crypto
    .createHmac('sha256', env.meetingSecret ?? env.sharedCaseSecret)
    .update(payload)
    .digest('base64url')
  return `${payload}.${firma}`
}

describe('la llave nueva', () => {
  it('mide 50 caracteres, no 132', () => {
    const t = generarTokenSala(ID, 'PROFESIONAL')
    expect(t).toHaveLength(50)
    expect(t).not.toContain('.')
  })

  it.each(['PACIENTE', 'PROFESIONAL'])('vale para %s y dice quién entra', (rol) => {
    const leido = verificarTokenSala(generarTokenSala(ID, rol))
    expect(leido?.aid).toBe(ID)
    expect(leido?.rol).toBe(rol)
  })

  /**
   * El rol viaja en el CÓDIGO del enlace, no dentro del cuerpo: la llave del
   * paciente y la del profesional para la misma cita son distintas, y ninguna
   * sirve para hacerse pasar por el otro.
   */
  it('la llave de la persona no abre como profesional', () => {
    const dePaciente = generarTokenSala(ID, 'PACIENTE')
    const deProfesional = generarTokenSala(ID, 'PROFESIONAL')

    expect(dePaciente).not.toBe(deProfesional)
    expect(verificarTokenSala(dePaciente)?.rol).toBe('PACIENTE')
  })

  /**
   * Determinista, y esto no es un detalle: si cambiara entre renders, el
   * enlace que se le mandó a alguien por WhatsApp dejaría de coincidir con el
   * que ve la coordinación. Ya pasó una vez — por eso el formato anterior no
   * llevaba marca de tiempo, y por eso el nuevo lleva una fija.
   */
  it('el mismo enlace, siempre', () => {
    expect(generarTokenSala(ID, 'PACIENTE')).toBe(generarTokenSala(ID, 'PACIENTE'))
  })

  it('una llave manipulada no abre', () => {
    const t = generarTokenSala(ID, 'PACIENTE')
    const tocada = t.slice(0, -1) + (t.slice(-1) === 'A' ? 'B' : 'A')
    expect(verificarTokenSala(tocada)).toBeNull()
  })
})

describe('los enlaces que ya circulan', () => {
  /**
   * Esta es la prueba que de verdad importa. Hay gente con su enlace guardado
   * en una conversación; si deja de abrir, se entera el día de su sesión.
   */
  it.each(['PACIENTE', 'PROFESIONAL'])('el formato anterior de %s sigue abriendo', (rol) => {
    const leido = verificarTokenSala(tokenDelFormatoAnterior(rol))
    expect(leido?.aid).toBe(ID)
    expect(leido?.rol).toBe(rol)
  })

  /** Y la deuda más vieja: el uuid pelado, mientras SALA_ACEPTA_UUID lo permita. */
  it('el uuid crudo se distingue de una llave firmada', () => {
    const leido = verificarTokenSala(ID)
    if (env.salaAceptaUuid) {
      expect(leido?.esUuidCrudo).toBe(true)
    } else {
      expect(leido).toBeNull()
    }
  })

  it('cualquier otra cosa no abre', () => {
    expect(verificarTokenSala('nada')).toBeNull()
    expect(verificarTokenSala('')).toBeNull()
    expect(verificarTokenSala(null)).toBeNull()
  })
})
