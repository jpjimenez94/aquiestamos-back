import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/config/database.js'
import { citaAgendada } from '../src/notifications/eventos.js'

/**
 * A la persona también se le avisa que su sesión quedó agendada.
 *
 * No se le avisaba. El profesional recibía su correo al instante desde el
 * primer día; ella no recibía nada: elegía su hora, la pantalla le decía que
 * le escribiríamos, y no salía nada hasta el recordatorio del día de la
 * sesión. Entre agendar y ese día podían pasar dos semanas en las que su cita
 * no existía en ningún sitio suyo —ni un correo que buscar, ni el enlace para
 * entrar—, y quien coordina no tenía forma de notarlo: la ficha de la cita
 * decía «nada pendiente».
 */
const creadas = []

async function avisosDe(citaId) {
  return prisma.notification.findMany({ where: { entityId: citaId } })
}

afterEach(async () => {
  for (const id of creadas.splice(0)) {
    await prisma.notification.deleteMany({ where: { entityId: id } })
  }
})

/** Una cita de mentira con la forma que trae `AppointmentModel`. */
function citaDe({ email }) {
  const id = randomUUID()
  creadas.push(id)
  return {
    id,
    patientId: randomUUID(),
    modality: 'VIRTUAL',
    meetingUrl: null,
    patient: { fullName: 'Angie Paola Restrepo', email, phone: '3000000000' },
  }
}

const PROFESIONAL = { fullName: 'Beatriz Elena López', email: 'beatriz@pruebas.local' }

describe('la confirmación de la sesión', () => {
  it('le llega a la persona, no solo al profesional', async () => {
    const cita = citaDe({ email: 'angie@pruebas.local' })
    await citaAgendada({ cita, profesional: PROFESIONAL, cuando: 'el martes a las 2:00 p. m.' })

    const avisos = await avisosDe(cita.id)
    const plantillas = avisos.map((a) => a.template).sort()
    expect(plantillas).toEqual(['CITA_AGENDADA', 'CITA_AGENDADA_PERSONA'])

    const suyo = avisos.find((a) => a.template === 'CITA_AGENDADA_PERSONA')
    expect(suyo.toEmail).toBe('angie@pruebas.local')
    expect(suyo.subject).toContain('el martes a las 2:00 p. m.')
  })

  /**
   * Y con SU llave de sala, no con la del profesional: son dos enlaces
   * firmados distintos y cruzarlos metería a cada uno con el rol del otro.
   */
  it('lleva su propio enlace de sala', async () => {
    const cita = citaDe({ email: 'angie2@pruebas.local' })
    await citaAgendada({ cita, profesional: PROFESIONAL, cuando: 'el martes' })

    const avisos = await avisosDe(cita.id)
    const suyo = avisos.find((a) => a.template === 'CITA_AGENDADA_PERSONA')
    const delProfesional = avisos.find((a) => a.template === 'CITA_AGENDADA')

    expect(suyo.payload.sala).toContain('/sala/')
    expect(suyo.payload.sala).not.toBe(delProfesional.payload.sala)
  })

  /**
   * Dar correo es opcional al pedir ayuda. Quien no lo dio no recibe nada, y
   * eso no es un fallo: es la razón por la que la ficha de la cita ahora pide
   * el WhatsApp en vez de decir «nada pendiente».
   */
  it('sin correo no se inventa un destinatario', async () => {
    const cita = citaDe({ email: null })
    await citaAgendada({ cita, profesional: PROFESIONAL, cuando: 'el martes' })

    const avisos = await avisosDe(cita.id)
    expect(avisos.map((a) => a.template)).toEqual(['CITA_AGENDADA'])
  })

  /** Una sesión presencial no tiene sala, y la línea del enlace no se inventa. */
  it('en presencial no manda un enlace de sala vacío', async () => {
    const cita = { ...citaDe({ email: 'angie3@pruebas.local' }), modality: 'PRESENCIAL' }
    await citaAgendada({ cita, profesional: PROFESIONAL, cuando: 'el martes' })

    const avisos = await avisosDe(cita.id)
    const suyo = avisos.find((a) => a.template === 'CITA_AGENDADA_PERSONA')
    expect(suyo.payload.sala).toBeNull()
  })
})
