import { describe, it, expect } from 'vitest'
import { PLANTILLAS, construir } from '../src/notifications/plantillas.js'

/**
 * Las plantillas de los avisos.
 *
 * Lo que más se cuida aquí es que ningún correo lleve datos de contacto de una
 * persona acompañada. Los correos viajan por servidores ajenos y se quedan en
 * bandejas que no controlamos; un aviso lleva un enlace y quien tenga que ver
 * esos datos entra por ahí y se identifica.
 */

/** Cada plantilla con un payload que la ejercite entera. */
const CASOS = {
  POSTULACION_RECIBIDA: { nombre: 'Ana' },
  APOYO_RECIBIDO: { nombre: 'Camila', disciplina: 'Logística' },
  POSTULACION_APROBADA: { nombre: 'Ana' },
  CITA_AGENDADA: {
    nombre: 'Ana',
    cuando: '2026-09-03 15:00',
    modalidad: 'VIRTUAL',
    ruta: '/portal/caso/abc',
  },
  REPORTE_RECIBIDO: {
    profesional: 'Ana María Pérez',
    resultado: 'NO_CONTESTA',
    dificultades: 'Entra a buzón',
    ruta: '/portal/personas/abc',
  },
  COORD_POSTULACION: { nombre: 'Ana María Pérez', ciudad: 'Ibagué', profesion: 'Psicología' },
  COORD_APOYO: { nombre: 'Camila Restrepo', disciplina: 'Logística', ciudad: 'Cali' },
  COORD_SOLICITUD: { ciudad: 'Ibagué' },
  COORD_PACIENTE_ADMITIDO: { prioridad: 'ALTA', ciudad: 'Ibagué', ruta: '/portal/personas/abc' },
}

describe('plantillas de avisos', () => {
  it('están todas cubiertas por una prueba', () => {
    // Si alguien añade una plantilla, esto falla hasta que le ponga un caso.
    expect(Object.keys(CASOS).sort()).toEqual(Object.keys(PLANTILLAS).sort())
  })

  for (const [clave, payload] of Object.entries(CASOS)) {
    describe(clave, () => {
      const { asunto, html, texto } = construir(clave, payload)

      it('tiene asunto, HTML y texto plano', () => {
        expect(asunto.length).toBeGreaterThan(3)
        expect(html).toContain('<!doctype html>')
        expect(texto.length).toBeGreaterThan(20)
        // El texto plano no es un adorno: es lo que ven los lectores de
        // pantalla y lo que queda si el HTML falla.
        expect(texto).not.toContain('<')
      })

      it('no lleva teléfonos', () => {
        expect(html.replace(/#[0-9a-f]{3,8}/gi, '')).not.toMatch(/\b\d{7,}\b/)
        expect(texto).not.toMatch(/\b\d{7,}\b/)
      })

      it('dice cómo ejercer los derechos sobre los datos', () => {
        expect(texto).toContain('eliminar tus datos')
      })

      it('no deja huecos sin rellenar', () => {
        expect(html).not.toContain('undefined')
        expect(html).not.toContain('[object Object]')
        expect(texto).not.toContain('undefined')
      })
    })
  }

  it('el aviso de solicitud no dice quién pidió ayuda', () => {
    // Detrás de una solicitud hay una persona en crisis. Que llegó una
    // solicitud es lo que coordinación necesita saber por correo; quién es,
    // se mira en el portal.
    const { html, texto } = construir('COORD_SOLICITUD', { ciudad: 'Ibagué' })
    expect(texto).toContain('Este correo no los incluye a propósito')
    expect(html).toContain('/portal/solicitudes')
  })

  it('el aviso de cita no nombra a la persona acompañada', () => {
    const { texto } = construir('CITA_AGENDADA', CASOS.CITA_AGENDADA)
    expect(texto).toContain('Ana')
    expect(texto).toContain('/portal/caso/abc')
    expect(texto.toLowerCase()).not.toContain('paciente:')
  })

  it('la prioridad sale en el asunto de una admisión', () => {
    expect(construir('COORD_PACIENTE_ADMITIDO', CASOS.COORD_PACIENTE_ADMITIDO).asunto).toContain(
      'alta',
    )
  })

  it('avisa si le piden una plantilla que no existe', () => {
    expect(() => construir('NO_EXISTE', {})).toThrow(/NO_EXISTE/)
  })
})
