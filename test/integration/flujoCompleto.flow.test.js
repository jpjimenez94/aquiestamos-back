import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { crearEnlaceTamizaje } from '../../src/auth/enlaceTamizaje.js'
import { crearEnlaceAgenda } from '../../src/auth/enlaceAgenda.js'
import { construir } from '../../src/notifications/plantillas.js'

const app = createApp()

/**
 * El camino completo, de principio a fin.
 *
 * Recorre lo que le pasa a una persona desde que llena el formulario hasta que
 * tiene su segunda sesión agendada, e IMPRIME los mensajes y correos que
 * saldrían en cada paso. No es solo una prueba de que no revienta: es la forma
 * de leer el recorrido tal como lo vive quien pide ayuda.
 *
 * Corre contra la base LOCAL —la guarda de `baseSegura` lo impone— así que
 * nada de esto toca los datos reales. Los correos se encolan y se cuentan,
 * pero no salen a ningún lado: en pruebas no hay SMTP ni Brevo configurados.
 */

const MARCA = `flujo-${Date.now()}`
const TELEFONO = '3152213872'
const CORREO = 'jpjimenez543@gmail.com'

const creados = { solicitud: null, paciente: null, profesional: null }
const guion = []

function paso(titulo, cuerpo) {
  guion.push({ titulo, cuerpo })
}

beforeAll(async () => {
  const profesional = await prisma.professional.create({
    data: {
      fullName: 'Beatriz Elena López',
      email: `beatriz.${MARCA}@pruebas.local`,
      phone: '3009998877',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: ['ADULTOS'],
      status: 'ACTIVO',
      maxActiveCases: 5,
      professionalCardVerified: true,
    },
  })
  creados.profesional = profesional.id

  await prisma.availabilityRule.createMany({
    data: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'].map((d) => ({
      professionalId: profesional.id,
      weekday: d,
      startMinute: 8 * 60,
      endMinute: 18 * 60,
      modality: 'AMBAS',
    })),
  })
})

afterAll(async () => {
  // Se borra TODO lo que creó esta prueba. Que corra contra la base local ya
  // lo garantiza la guarda; esto además evita que se acumule entre corridas.
  if (creados.paciente) {
    await prisma.appointment.deleteMany({ where: { patientId: creados.paciente } })
    await prisma.caseAssignment.deleteMany({ where: { patientId: creados.paciente } })
    await prisma.patient.deleteMany({ where: { id: creados.paciente } })
  }
  if (creados.solicitud) {
    await prisma.triageResponse.deleteMany({ where: { supportRequestId: creados.solicitud } })
    await prisma.supportRequest.deleteMany({ where: { id: creados.solicitud } })
  }
  if (creados.profesional) {
    await prisma.availabilityRule.deleteMany({ where: { professionalId: creados.profesional } })
    await prisma.professional.deleteMany({ where: { id: creados.profesional } })
  }
  await prisma.notification.deleteMany({ where: { toEmail: CORREO } })

  // El guion se imprime al final, seguido, para poder leerlo de corrido.
  console.log('\n' + '═'.repeat(72))
  console.log('  EL CAMINO COMPLETO — mensajes y correos que saldrían')
  console.log('  destino de prueba: ' + TELEFONO + ' · ' + CORREO)
  console.log('═'.repeat(72))
  for (const [i, p] of guion.entries()) {
    console.log(`\n──── ${i + 1}. ${p.titulo} ` + '─'.repeat(Math.max(0, 50 - p.titulo.length)))
    console.log(p.cuerpo)
  }
  console.log('\n' + '═'.repeat(72) + '\n')
})

describe('el camino completo de una persona', () => {
  it('1 · pide ayuda desde el formulario público', async () => {
    const res = await request(app).post('/api/support-requests').send({
      name: 'Juan Pablo (prueba de flujo)',
      email: CORREO,
      phone: TELEFONO,
      city: 'Pereira (Risaralda)',
      forWhom: 'PARA_MI',
      preferredContact: 'WHATSAPP',
      preferredModality: 'VIRTUAL',
      consentVersion: '2026-08',
      dataConsent: true,
      sensitiveDataConsent: true,
    })
    expect(res.status).toBe(201)

    creados.solicitud = (
      await prisma.supportRequest.findFirst({ where: { phone: TELEFONO }, orderBy: { createdAt: 'desc' } })
    ).id

    paso(
      'Ella llena el formulario · WhatsApp que le manda coordinación',
      [
        'Hola Juan Pablo, te escribimos de la Red Aquí Estamos.',
        '',
        'Recibimos tu solicitud de acompañamiento. Gracias por dar este paso.',
        '',
        'Son 7 preguntas cortas, se responden en un minuto:',
        `https://www.redaquiestamos.org/tamizaje/${crearEnlaceTamizaje(creados.solicitud)}`,
      ].join('\n'),
    )
  })

  it('2 · responde el tamizaje por su enlace', async () => {
    const token = crearEnlaceTamizaje(creados.solicitud)
    const res = await request(app).post(`/api/triage/${token}`).send({
      safePlace: true,
      distress: 4,
      sleepAndEat: 'MAS_O_MENOS',
      dailyFunction: 'CON_DIFICULTAD',
      hasSupport: false,
      selfHarmThoughts: false,
      howSoon: 'ESTA_SEMANA',
      availableDays: ['LUNES', 'MARTES'],
      availableSlots: ['TARDE'],
      preferredModality: 'VIRTUAL',
      sensitiveDataConsent: true,
    })
    expect(res.status).toBe(201)

    const t = await prisma.triageResponse.findFirst({ where: { supportRequestId: creados.solicitud } })
    paso(
      'Responde el tamizaje',
      `El sistema calcula prioridad ${t.suggestedPriority}.\nRazones: ${(t.reasons ?? []).join(' · ') || '—'}`,
    )
  })

  it('3 · queda admitida y en la cola', async () => {
    // Responder el tamizaje YA la admite: el sistema crea la persona sola, con
    // la prioridad que salió de sus respuestas, sin que nadie intervenga.
    const paciente = await prisma.patient.findFirst({
      where: { supportRequestId: creados.solicitud },
    })
    expect(paciente).not.toBeNull()
    creados.paciente = paciente.id

    paso(
      'Queda admitida · su enlace de agenda ya existe',
      `Se le genera un enlace que le sirve para TODAS sus sesiones:\nhttps://www.redaquiestamos.org/agenda/${crearEnlaceAgenda(paciente.id)}\n\nSi lo abre ahora, le dice que aún se está buscando profesional y que lo guarde.`,
    )

    const antes = await request(app).get(`/api/mi-agenda/${crearEnlaceAgenda(paciente.id)}`)
    expect(antes.body.data.estado).toBe('SIN_PROFESIONAL')
  })

  it('4 · se le propone el caso a una profesional', async () => {
    await prisma.caseAssignment.create({
      data: {
        patientId: creados.paciente,
        professionalId: creados.profesional,
        status: 'PROPUESTA',
        startedAt: new Date(),
      },
    })

    paso(
      'WhatsApp a la profesional · con el plazo de 2 horas',
      [
        'Hola Beatriz, te escribimos de Red Aquí Estamos.',
        '',
        'Queremos proponerte un acompañamiento. Cuéntanos si puedes tomarlo:',
        '',
        '· La persona está en Pereira (Risaralda).',
        '· Prefiere que sea virtual.',
        '· Puede lunes y martes en la tarde.',
        '',
        'Te pedimos responder dentro de las próximas 2 horas. Si para entonces no',
        'sabemos de ti, le proponemos el caso a otro profesional para que la persona',
        'no siga esperando.',
        '',
        'Sus datos de contacto aparecen cuando aceptas, no antes.',
      ].join('\n'),
    )
  })

  it('5 · la profesional acepta', async () => {
    await prisma.caseAssignment.updateMany({
      where: { patientId: creados.paciente, status: 'PROPUESTA' },
      data: { status: 'ACEPTADA', respondedAt: new Date() },
    })

    paso(
      'WhatsApp a la persona · AQUÍ ESTÁ EL CAMBIO',
      [
        'Hola Juan Pablo, te escribimos de la Red Aquí Estamos.',
        '',
        'Ya tenemos quién te acompañe: Beatriz Elena López, profesional de la red.',
        '',
        '*Aquí puedes elegir tú misma la hora que te sirva*, entre las que tiene libres:',
        `https://www.redaquiestamos.org/agenda/${crearEnlaceAgenda(creados.paciente)}`,
        '',
        'Guarda ese enlace: te sirve para esta sesión y para las siguientes.',
        '',
        'Si prefieres, dinos por aquí cuándo puedes y lo cuadramos nosotros.',
        '',
        '── Antes este mensaje listaba días y franjas y había que responder por',
        '   WhatsApp para que alguien agendara a mano. Eran 3 toques y 2 esperas.',
      ].join('\n'),
    )
  })

  it('6 · ella entra al enlace y elige su hora sola', async () => {
    const token = crearEnlaceAgenda(creados.paciente)

    const vista = await request(app).get(`/api/mi-agenda/${token}`)
    expect(vista.status).toBe(200)
    expect(vista.body.data.profesional).toBe('Beatriz Elena López')
    expect(vista.body.data.huecos.length).toBeGreaterThan(0)

    const elegido = vista.body.data.huecos[0]
    const res = await request(app).post(`/api/mi-agenda/${token}`).send({ inicio: elegido.inicio })
    expect(res.status).toBe(201)

    paso(
      'Elige su hora · sin que nadie intervenga',
      [
        `Ve ${vista.body.data.huecos.length} horas libres de Beatriz y toca una.`,
        `Queda agendada: ${res.body.data.cuando}`,
        '',
        'La asignación pasa sola de ACEPTADA a ACTIVA.',
        'En la auditoría queda que agendó ELLA, no coordinación.',
      ].join('\n'),
    )

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: creados.paciente } })
    expect(asignacion.status).toBe('ACTIVA')
  })

  it('7 · el correo que le llega a la profesional', async () => {
    const { asunto, texto } = construir('CITA_AGENDADA', {
      nombre: 'Beatriz',
      cuando: 'el martes a las 2:00 p. m.',
      modalidad: 'virtual',
      ruta: '/portal/caso/xxxx',
    })
    paso(
      'Correo a la profesional (plantilla CITA_AGENDADA)',
      `Asunto: ${asunto}\n\n${(texto ?? '').slice(0, 400)}`,
    )
  })

  it('8 · la segunda sesión, con el mismo enlace', async () => {
    const token = crearEnlaceAgenda(creados.paciente)
    const vista = await request(app).get(`/api/mi-agenda/${token}`)

    // La pantalla le avisa que ya tiene una y que esto sería adicional.
    expect(vista.body.data.proxima).not.toBeNull()

    const otro = vista.body.data.huecos[0]
    const res = await request(app).post(`/api/mi-agenda/${token}`).send({ inicio: otro.inicio })
    expect(res.status).toBe(201)

    const citas = await prisma.appointment.count({ where: { patientId: creados.paciente } })
    expect(citas).toBe(2)

    paso(
      'Agenda su segunda sesión',
      [
        `La pantalla le avisa: «Ya tienes una sesión el ${vista.body.data.proxima.cuando}.`,
        'Si eliges otra hora, será una sesión adicional.»',
        '',
        `Elige y queda: ${res.body.data.cuando}`,
        'Cero intervención de coordinación en todo este paso.',
      ].join('\n'),
    )
  })

  it('9 · le cambian de profesional y el enlace sigue sirviendo', async () => {
    const otra = await prisma.professional.create({
      data: {
        fullName: 'Martha Liliana Riaño',
        email: `martha.${MARCA}@pruebas.local`,
        phone: '3001112233',
        city: 'Pereira',
        profession: 'Psicología',
        modality: 'VIRTUAL',
        populations: ['ADULTOS'],
        status: 'ACTIVO',
        maxActiveCases: 5,
        professionalCardVerified: true,
      },
    })
    await prisma.availabilityRule.createMany({
      data: ['LUNES', 'MIERCOLES'].map((d) => ({
        professionalId: otra.id,
        weekday: d,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
        modality: 'AMBAS',
      })),
    })

    await prisma.caseAssignment.updateMany({
      where: { patientId: creados.paciente, status: 'ACTIVA' },
      data: { status: 'CERRADA', endedAt: new Date(), closeReason: 'Cambio de profesional' },
    })
    await prisma.caseAssignment.create({
      data: {
        patientId: creados.paciente,
        professionalId: otra.id,
        status: 'ACTIVA',
        startedAt: new Date(),
        respondedAt: new Date(),
      },
    })

    const token = crearEnlaceAgenda(creados.paciente)
    const vista = await request(app).get(`/api/mi-agenda/${token}`)
    expect(vista.body.data.profesional).toBe('Martha Liliana Riaño')

    paso(
      'Cambia de profesional · NO se le manda ningún enlace nuevo',
      [
        'El acompañamiento pasa de Beatriz a Martha. Beatriz queda libre para otras personas.',
        '',
        'La persona abre EL MISMO enlace de siempre y ve:',
        `  «Tu acompañamiento es con Martha Liliana Riaño»`,
        `  ${vista.body.data.huecos.length} horas libres, las de Martha`,
        '',
        'Nadie tuvo que mandarle nada. El acompañamiento la siguió a ella.',
      ].join('\n'),
    )

    await prisma.availabilityRule.deleteMany({ where: { professionalId: otra.id } })
    await prisma.appointment.deleteMany({ where: { professionalId: otra.id } })
    await prisma.caseAssignment.deleteMany({ where: { professionalId: otra.id } })
    await prisma.professional.deleteMany({ where: { id: otra.id } })
  })
})
