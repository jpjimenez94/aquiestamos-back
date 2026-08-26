import { describe, it, expect } from 'vitest'
import { PLANTILLAS, construir } from '../src/notifications/plantillas.js'
import { partirRemitente } from '../src/notifications/mailerApi.js'

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
  SOLICITUD_DOCUMENTOS_PROFESIONAL: { nombre: 'Ana', ruta: '/documentos/xyz123' },
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
  COORD_PACIENTE_ADMITIDO: { prioridad: 'ALTA', ciudad: 'Ibagué', sinRespuesta: false, ruta: '/portal/personas/abc' },
  COORD_TAMIZAJE_ALTA: { ciudad: 'Ibagué', esMenor: true, ruta: '/portal/solicitudes' },
  COORD_PROPUESTA_ACEPTADA: {
    profesional: 'Ana María Pérez',
    dias: ['MARTES', 'JUEVES'],
    franjas: ['TARDE'],
    nota: 'después de las 4 mejor',
    ruta: '/portal/personas/abc',
  },
  COORD_PROPUESTA_RECHAZADA: {
    profesional: 'Ana María Pérez',
    motivo: 'Me queda muy lejos',
    ruta: '/portal/personas/abc',
  },
  RECORDATORIO_CITA_PROFESIONAL: {
    nombre: 'Ana',
    cuando: '2026-08-25T19:30:00-05:00',
    modalidad: 'VIRTUAL',
    ruta: '/portal/caso/abc',
  },
  RECORDATORIO_CITA_PERSONA: {
    nombre: 'Camilo',
    profesional: 'Ana',
    cuando: '2026-08-25T19:30:00-05:00',
    modalidad: 'VIRTUAL',
  },
  PIDE_REPORTE: {
    nombre: 'Ana',
    cuando: '2026-08-25T19:30:00-05:00',
    ruta: '/portal/caso/abc',
  },
  COORD_SLA_ALTA: { ciudad: 'Cali', dias: 4, ruta: '/portal/personas/abc' },
  COORD_DOCUMENTOS_RECIBIDOS: {
    profesional: 'Ana Maria Perez',
    ruta: '/portal/verificaciones',
  },
  COORD_ERROR: {
    origen: 'GET /api/patients',
    mensaje: 'column does not exist',
    donde: 'at PatientModel.findAll (src/models/patient.model.js:20)',
  },
  COORD_POSIBLE_DUPLICADO: {
    ciudad: 'Cali',
    rutaNueva: '/portal/personas/abc',
    rutaExistente: '/portal/personas/def',
  },
  COORD_ASIGNACION_VENCIDA: {
    profesional: 'Ana María Pérez',
    tramo: 'profesional',
    ruta: '/portal/personas/abc',
  },
  TAREA_INVITACION: {
    nombre: 'Camila',
    titulo: 'Verificar tarjetas profesionales',
    descripcion: 'Revisar 10 postulaciones pendientes',
    nota: 'Antes del viernes si es posible',
    fechaLimite: '28 de agosto de 2026',
    ruta: '/turno/tok123',
  },
  TAREA_RESPUESTA: {
    nombreVoluntario: 'Camila Restrepo',
    titulo: 'Verificar tarjetas profesionales',
    accion: 'ACEPTADO',
    motivoRechazo: null,
    ruta: '/portal/tareas/abc',
  },
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

  /**
   * Este es el aviso más delicado del sistema: detrás puede haber alguien que
   * acaba de decir que ha pensado en hacerse daño. Se distingue en el asunto
   * —para que no se pierda entre los demás— y no cuenta nada de la persona.
   */
  it('el aviso urgente del tamizaje se nota en el asunto y no dice quién es', () => {
    const { asunto, texto, html } = construir('COORD_TAMIZAJE_ALTA', CASOS.COORD_TAMIZAJE_ALTA)
    expect(asunto).toContain('URGENTE')
    expect(texto).toContain('Este correo no los incluye a propósito')
    expect(html).toContain('/portal/solicitudes')
    // Ni las respuestas ni la pregunta que las disparó viajan por correo.
    expect(texto.toLowerCase()).not.toContain('hacerse daño')
    expect(texto.toLowerCase()).not.toContain('hacerte daño')
  })

  it('el aviso urgente avisa si es menor de edad, porque cambia a quién se llama', () => {
    expect(construir('COORD_TAMIZAJE_ALTA', { ...CASOS.COORD_TAMIZAJE_ALTA, esMenor: true }).texto)
      .toContain('menor de edad')
    expect(construir('COORD_TAMIZAJE_ALTA', { ...CASOS.COORD_TAMIZAJE_ALTA, esMenor: false }).texto)
      .not.toContain('menor de edad')
  })

  it('avisa si le piden una plantilla que no existe', () => {
    expect(() => construir('NO_EXISTE', {})).toThrow(/NO_EXISTE/)
  })
})

/**
 * Railway bloquea el SMTP saliente en sus planes Free, Trial y Hobby, así que
 * en producción el correo sale por la API HTTPS de Brevo. Lo único delicado de
 * ese camino es armar el remitente: si sale mal, Brevo rechaza el envío
 * entero.
 */
describe('remitente para la API de Brevo', () => {
  it('separa el nombre del correo', () => {
    expect(partirRemitente('Red Aquí Estamos <no-responder@x.org>')).toEqual({
      name: 'Red Aquí Estamos',
      email: 'no-responder@x.org',
    })
  })

  it('acepta un remitente sin nombre', () => {
    expect(partirRemitente('suelto@x.org')).toEqual({ email: 'suelto@x.org' })
  })

  it('aguanta comillas y espacios de más', () => {
    expect(partirRemitente('  "Red Aquí Estamos"  <  no-responder@x.org  >  ')).toEqual({
      name: 'Red Aquí Estamos',
      email: 'no-responder@x.org',
    })
  })
})

/**
 * El aviso de una admisión por silencio no es el mismo aviso con otro tono:
 * dice que hay que hacer algo distinto. A esa persona nadie le ha preguntado
 * cómo está, así que su prioridad es una suposición del sistema y hay que
 * llamarla antes de asignarle profesional.
 */
describe('admisión de quien nunca respondió', () => {
  const base = { prioridad: 'MEDIA', ciudad: 'Ibagué', ruta: '/portal/personas/abc' }

  it('el asunto avisa que hay que llamarla', () => {
    const { asunto } = construir('COORD_PACIENTE_ADMITIDO', { ...base, sinRespuesta: true })
    expect(asunto).toContain('sin haber respondido')
    expect(asunto).toContain('llamarla')
  })

  it('deja claro que la prioridad es una suposición', () => {
    const { texto } = construir('COORD_PACIENTE_ADMITIDO', { ...base, sinRespuesta: true })
    expect(texto).toContain('No sabemos cómo está')
    expect(texto).toContain('suposición')
  })

  it('el aviso normal no dice nada de eso', () => {
    const { asunto, texto } = construir('COORD_PACIENTE_ADMITIDO', { ...base, sinRespuesta: false })
    expect(asunto).not.toContain('sin haber respondido')
    expect(texto).not.toContain('No sabemos cómo está')
  })
})


/**
 * Los avisos de la negociación.
 *
 * Los dos existen para lo mismo: desbloquear el siguiente paso. Un caso
 * esperando en silencio es la forma más fácil de que alguien lleve dos
 * semanas sin acompañamiento sin que nadie se dé cuenta.
 */
describe('avisos de la propuesta', () => {
  it('cuando acepta, el aviso lleva sus horarios en palabras', () => {
    const { asunto, texto } = construir('COORD_PROPUESTA_ACEPTADA', CASOS.COORD_PROPUESTA_ACEPTADA)
    expect(asunto).toContain('falta cuadrar horario')
    expect(texto).toContain('Martes')
    expect(texto).toContain('Tarde')
    expect(texto).toContain('después de las 4 mejor')
  })

  it('cuando no puede, el aviso dice qué hacer: proponérselo a otro', () => {
    const { texto } = construir('COORD_PROPUESTA_RECHAZADA', CASOS.COORD_PROPUESTA_RECHAZADA)
    expect(texto).toContain('vuelve a la cola')
    expect(texto).toContain('Me queda muy lejos')
  })

  /** Ninguno de los dos dice a quién acompaña: llevan un enlace. */
  it('no nombran a la persona acompañada', () => {
    for (const clave of ['COORD_PROPUESTA_ACEPTADA', 'COORD_PROPUESTA_RECHAZADA']) {
      const { texto } = construir(clave, CASOS[clave])
      expect(texto).not.toMatch(/d{7,}/)
      expect(texto).toContain('/portal/personas/abc')
    }
  })
})

describe('aviso de asignación vencida', () => {
  /**
   * El barrido cancela por dos silencios distintos y el aviso tiene que decir
   * cuál fue: no es lo mismo un profesional que no contesta —dato para el
   * emparejamiento— que una persona que no confirmó.
   */
  it('dice que fue el profesional el que no respondió', () => {
    const { html } = construir('COORD_ASIGNACION_VENCIDA', {
      profesional: 'Ana María Pérez',
      tramo: 'profesional',
      ruta: '/portal/personas/abc',
    })
    expect(html).toContain('no respondió a la propuesta')
    expect(html).toContain('volvió a la cola')
  })

  it('dice que fue la persona la que no confirmó, sin nombrarla', () => {
    const { html, texto } = construir('COORD_ASIGNACION_VENCIDA', {
      profesional: 'Ana María Pérez',
      tramo: 'persona',
      ruta: '/portal/personas/abc',
    })
    expect(html).toContain('no confirmó horario')
    // El nombre que sale es el del profesional; la persona va como enlace.
    expect(texto).not.toMatch(/paciente:/i)
  })
})

describe('el reporte que dice qué sigue', () => {
  it('el aviso lleva la línea que decide: agendar otra o cerrar', () => {
    const { html } = construir('REPORTE_RECIBIDO', {
      profesional: 'Ana María Pérez',
      resultado: 'YA_ATENDIDA',
      queSigue: 'SUFICIENTE',
      dificultades: null,
      ruta: '/portal/personas/abc',
    })
    expect(html).toContain('Qué sigue:')
    expect(html).toContain('Con esta fue suficiente')
  })

  it('sin qué sigue, la línea simplemente no sale', () => {
    const { html } = construir('REPORTE_RECIBIDO', {
      profesional: 'Ana María Pérez',
      resultado: 'NO_CONTESTA',
      queSigue: null,
      dificultades: null,
      ruta: '/portal/personas/abc',
    })
    expect(html).not.toContain('Qué sigue:')
  })
})

describe('los correos del barrido de citas', () => {
  it('el recordatorio a la persona lleva las líneas de crisis', () => {
    const { html } = construir('RECORDATORIO_CITA_PERSONA', {
      nombre: 'Camilo',
      profesional: 'Ana',
      cuando: '2026-08-25T19:30:00-05:00',
      modalidad: 'VIRTUAL',
    })
    expect(html).toContain('123')
    expect(html).toContain('106')
    // y la fecha sale legible en hora de Bogotá, no en ISO
    expect(html).toContain('agosto')
    expect(html).not.toContain('2026-08-25T')
  })

  it('pedir el reporte pregunta las tres cosas del cierre', () => {
    const { html } = construir('PIDE_REPORTE', {
      nombre: 'Ana',
      cuando: '2026-08-25T19:30:00-05:00',
      ruta: '/portal/caso/abc',
    })
    expect(html).toContain('si se pudo hacer')
    expect(html).toContain('necesita más sesiones')
  })

  it('la alarma de SLA dice los días y no dice quién es', () => {
    const { html, texto } = construir('COORD_SLA_ALTA', {
      ciudad: 'Cali',
      dias: 4,
      ruta: '/portal/personas/abc',
    })
    expect(html).toContain('4 días')
    expect(texto).not.toMatch(/paciente:/i)
  })
})
