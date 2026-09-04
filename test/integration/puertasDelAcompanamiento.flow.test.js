import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { hashearClave } from '../../src/auth/password.js'
import { deLocalAUtc, diaDeLaSemana, partesLocales } from '../../src/services/timezone.service.js'
import { barrerAsignaciones } from '../../src/asignacion/barrido.js'

/**
 * Las puertas del acompañamiento, recorridas de una en una.
 *
 * `agenda.flow.test.js` cubre el camino feliz. Esta prueba cubre lo otro: las
 * puertas que existían a medias o no existían, y que se descubrieron auditando
 * el flujo del paso 0 al 7. Cada bloque de aquí es un fallo que llegó a
 * producción, y lo que se comprueba no es que el código «funcione» sino que la
 * consecuencia concreta no vuelva.
 *
 * Todas comparten un rasgo: no fallaban. No había error, no había log, no había
 * pantalla roja. Un caso se paraba, un correo salía diciendo lo contrario de lo
 * que pasó, o alguien se presentaba a una sesión cancelada. Por eso se prueban
 * contra PostgreSQL de verdad y por la API, que es donde se veían.
 */

const app = createApp()
const marca = `puertas-${process.pid}`
const CLAVE = 'claveDePrueba2026'

const tokens = {}

/** Un martes futuro, en hora de Bogotá. Mismo criterio que el flujo completo. */
function martesA(minutosDelDia, semanasAdelante = 2) {
  const DIA = 24 * 60 * 60 * 1000
  let cursor = new Date(Date.now() + semanasAdelante * 7 * DIA)
  while (diaDeLaSemana(cursor) !== 'MARTES') cursor = new Date(cursor.getTime() + DIA)

  const p = partesLocales(cursor)
  return deLocalAUtc(p.year, p.month, p.day, minutosDelDia)
}

async function entrar(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: CLAVE })
  return res.body.data.token
}

const agendador = () => ({ Authorization: `Bearer ${tokens.AGENDADOR}` })

/** Un profesional activo. `conAgenda` decide si puede recibir casos. */
async function crearProfesional({ sufijo, conAgenda = true }) {
  const profesional = await prisma.professional.create({
    data: {
      fullName: `Profesional ${sufijo} ${marca}`,
      email: `${sufijo}.${marca}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
      maxActiveCases: 5,
    },
  })

  if (conAgenda) {
    await prisma.availabilityRule.create({
      data: {
        professionalId: profesional.id,
        weekday: 'MARTES',
        startMinute: 8 * 60,
        endMinute: 18 * 60,
        modality: 'VIRTUAL',
      },
    })
  }

  return profesional
}

async function crearPersona(sufijo) {
  return prisma.patient.create({
    data: {
      fullName: `Persona ${sufijo} ${marca}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'EN_ADMISION',
      priority: 'ALTA',
      preferredModality: 'VIRTUAL',
    },
  })
}

/** Envejece el reloj del que vive el barrido, sin esperar tres días. */
function envejecer(asignacionId, dias) {
  const cuando = new Date(Date.now() - dias * 24 * 3600 * 1000)
  return prisma.caseAssignment.update({
    where: { id: asignacionId },
    data: { startedAt: cuando, respondedAt: cuando },
  })
}

beforeAll(async () => {
  const email = `agendador.${marca}@pruebas.local`
  await prisma.user.create({
    data: {
      email,
      name: `Prueba AGENDADOR`,
      role: 'AGENDADOR',
      passwordHash: await hashearClave(CLAVE),
      mustChangePassword: false,
    },
  })
  tokens.AGENDADOR = await entrar(email)
}, 40000)

beforeEach(async () => {
  // Solo puede haber una asignación viva por persona, así que cada bloque
  // empieza con la mesa limpia. Las citas primero: cuelgan de la asignación.
  await prisma.appointment.deleteMany({ where: { patient: { fullName: { contains: marca } } } })
  await prisma.caseAssignment.deleteMany({ where: { patient: { fullName: { contains: marca } } } })
})

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { professional: { email: { contains: marca } } } })
  await prisma.caseAssignment.deleteMany({ where: { professional: { email: { contains: marca } } } })
  await prisma.availabilityRule.deleteMany({ where: { professional: { email: { contains: marca } } } })
  await prisma.professional.deleteMany({ where: { email: { contains: marca } } })
  await prisma.patient.deleteMany({ where: { fullName: { contains: marca } } })
  await prisma.notification.deleteMany({ where: { toEmail: { contains: marca } } })

  const usuarios = await prisma.user.findMany({ where: { email: { contains: marca } } })
  const idsUsuarios = usuarios.map((u) => u.id)
  await prisma.session.deleteMany({ where: { userId: { in: idsUsuarios } } })
  await prisma.auditLog.deleteMany({ where: { actorId: { in: idsUsuarios } } })
  await prisma.user.deleteMany({ where: { id: { in: idsUsuarios } } })
  await prisma.$disconnect()
})

// ---------------------------------------------------------------- paso 0 y 3

describe('paso 0 · a quién se le puede asignar', () => {
  /**
   * El diseño de «asignar sin pedir permiso» se sostiene sobre tres cosas:
   * que declinar cueste un toque, que haya cupo y que haya agenda cargada. El
   * comentario del servicio afirmaba que las dos últimas se comprobaban; solo
   * se comprobaba el cupo.
   *
   * Sin agenda no hay nada que asignar: el paso siguiente manda a la persona a
   * elegir hora «entre los espacios que él ya tiene marcados como libres», y
   * esa pantalla le sale vacía. Y como ya nadie espera respuesta, el caso se
   * para sin que salte nada.
   */
  it('a un profesional sin franjas cargadas, no', async () => {
    const sinAgenda = await crearProfesional({ sufijo: 'sinagenda', conAgenda: false })
    const persona = await crearPersona('p0')

    const res = await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: sinAgenda.id, patientId: persona.id })

    expect(res.status).toBe(422)
    expect(res.body.details.codigo).toBe('SIN_AGENDA')

    // Y no deja media asignación creada por el camino.
    const vivas = await prisma.caseAssignment.count({ where: { patientId: persona.id } })
    expect(vivas).toBe(0)
  })

  it('con agenda, la asignación nace ACEPTADA y con el reloj corriendo', async () => {
    const profesional = await crearProfesional({ sufijo: 'conagenda' })
    const persona = await crearPersona('p0b')

    const res = await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    expect(res.status).toBe(201)

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })
    expect(asignacion.status).toBe('ACEPTADA')
    // El campo del que vive el barrido. Se escribe al asignar, no al avisar:
    // por eso el aviso manual al profesional no puede tardar tres días.
    expect(asignacion.respondedAt).not.toBeNull()
  })
})

// ------------------------------------------------------------------- el reloj

describe('el reloj de los tres días', () => {
  /**
   * El caso que costó sesiones: coordinación agenda desde el portal —«ya me
   * confirmó»— y el barrido lo cancelaba igual.
   *
   * `crearCita` no activaba la asignación: eso solo lo hacía el enlace de la
   * persona. La asignación se quedaba en ACEPTADA con una cita confirmada
   * encima y, tres días después de asignar, el barrido se llevaba las dos.
   */
  it('agendar desde coordinación activa el caso, y el barrido ya no lo toca', async () => {
    const profesional = await crearProfesional({ sufijo: 'reloj' })
    const persona = await crearPersona('reloj')

    const asignada = await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })
    expect(asignada.status).toBe(201)

    const inicio = martesA(9 * 60)
    const cita = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: profesional.id,
        patientId: persona.id,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
        modalidad: 'VIRTUAL',
      })
    expect(cita.status).toBe(201)

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })
    expect(asignacion.status).toBe('ACTIVA')

    // Aunque el reloj esté vencido de sobra: lo que lo salva es tener sesión.
    await envejecer(asignacion.id, 30)
    await barrerAsignaciones()

    const despues = await prisma.caseAssignment.findUnique({ where: { id: asignacion.id } })
    expect(despues.status).toBe('ACTIVA')

    const laCita = await prisma.appointment.findUnique({ where: { id: cita.body.data.id } })
    expect(laCita.status).not.toBe('CANCELADA')
  })

  /**
   * Y cuando de verdad vence, el motivo no reparte culpas.
   *
   * Decía «la persona no confirmó horario». El sistema no sabe eso: el reloj
   * arranca al asignar y al profesional se le avisa a mano, así que puede ser
   * que ella no eligiera o que a él nunca le llegara nada.
   */
  it('sin sesión sí se libera, y el motivo no culpa a nadie', async () => {
    const profesional = await crearProfesional({ sufijo: 'vence' })
    const persona = await crearPersona('vence')

    await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })
    await envejecer(asignacion.id, 30)
    await barrerAsignaciones()

    const despues = await prisma.caseAssignment.findUnique({ where: { id: asignacion.id } })
    expect(despues.status).toBe('CANCELADA')
    expect(despues.closeReason).toMatch(/no se agend/i)
    expect(despues.closeReason).not.toMatch(/la persona no confirm/i)

    // Y vuelve a estar visible para quien coordina.
    const vuelta = await prisma.patient.findUnique({ where: { id: persona.id } })
    expect(vuelta.status).toBe('EN_ADMISION')
  })
})

// ------------------------------------------------------------- soltar el caso

describe('soltar el caso deja rastro de por qué', () => {
  /**
   * Son dos salidas y el sistema solo sabía escribir una. RECHAZADA dice «este
   * profesional no podía»; CANCELADA, «no se pudo cuadrar». A RECHAZADA solo se
   * llegaba desde el enlace del profesional, así que cuando avisaba por
   * WhatsApp —lo normal— coordinación reasignaba y la distinción se perdía.
   */
  it('reasignar puede registrar que fue el profesional quien no pudo', async () => {
    const profesional = await crearProfesional({ sufijo: 'rechaza' })
    const persona = await crearPersona('rechaza')

    await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })

    const res = await request(app)
      .post(`/api/appointments/asignaciones/${asignacion.id}/cancelar`)
      .set(agendador())
      .send({ motivo: 'Se le cruzó un viaje', rechazo: true })

    expect(res.status).toBe(200)

    const despues = await prisma.caseAssignment.findUnique({ where: { id: asignacion.id } })
    expect(despues.status).toBe('RECHAZADA')
    // El porqué va donde se lee «por qué no pudo», no en el cierre genérico.
    expect(despues.declineReason).toBe('Se le cruzó un viaje')
  })

  it('y sin esa marca, sigue siendo una cancelación', async () => {
    const profesional = await crearProfesional({ sufijo: 'cancela' })
    const persona = await crearPersona('cancela')

    await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })

    await request(app)
      .post(`/api/appointments/asignaciones/${asignacion.id}/cancelar`)
      .set(agendador())
      .send({ motivo: 'No se pudo cuadrar con sus horarios' })

    const despues = await prisma.caseAssignment.findUnique({ where: { id: asignacion.id } })
    expect(despues.status).toBe('CANCELADA')
  })

  /**
   * Y las sesiones vivas se caen con el caso — incluidas las que quedaron sin
   * enlazar. El filtro miraba `caseAssignmentId`, y una cita creada cuando no
   * había asignación abierta lo lleva nulo: sobrevivía con el profesional
   * anterior, ocupando su agenda y disparando recordatorios.
   */
  it('reasignar cancela también la cita que quedó sin enlazar', async () => {
    const profesional = await crearProfesional({ sufijo: 'huerfana' })
    const persona = await crearPersona('huerfana')

    const inicio = martesA(10 * 60)
    const sinEnlace = await prisma.appointment.create({
      data: {
        professionalId: profesional.id,
        patientId: persona.id,
        caseAssignmentId: null,
        startsAt: inicio,
        endsAt: new Date(inicio.getTime() + 45 * 60000),
        bufferMinutes: 30,
        modality: 'VIRTUAL',
        status: 'CONFIRMADA',
      },
    })

    await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })

    await request(app)
      .post(`/api/appointments/asignaciones/${asignacion.id}/cancelar`)
      .set(agendador())
      .send({ motivo: 'La persona pidió cambio' })

    const despues = await prisma.appointment.findUnique({ where: { id: sinEnlace.id } })
    expect(despues.status).toBe('CANCELADA')
  })
})

// -------------------------------------------------------------- estados de la cita

describe('los estados de una sesión', () => {
  async function conCitaProgramada(sufijo) {
    const profesional = await crearProfesional({ sufijo })
    const persona = await crearPersona(sufijo)

    await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    const inicio = martesA(11 * 60)
    const cita = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: profesional.id,
        patientId: persona.id,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
        modalidad: 'VIRTUAL',
        estado: 'PROGRAMADA',
      })

    return { profesional, persona, citaId: cita.body.data.id }
  }

  /**
   * Una cita puede llegar a su hora sin pasar por CONFIRMADA —la confirmación
   * la da la persona, y no siempre la da— y que aun así no se presente nadie.
   * Sin esta transición había que cancelarla, que dice otra cosa, o confirmarla
   * primero, que es escribir en la base algo que no pasó.
   */
  it('se puede marcar «no asistió» aunque nunca se confirmara', async () => {
    const { citaId } = await conCitaProgramada('noasistio')

    const res = await request(app)
      .patch(`/api/appointments/${citaId}/estado`)
      .set(agendador())
      .send({ estado: 'NO_ASISTIO' })

    expect(res.status).toBe(200)
    const cita = await prisma.appointment.findUnique({ where: { id: citaId } })
    expect(cita.status).toBe('NO_ASISTIO')
  })

  /**
   * Reprogramar era el único de los tres caminos que crean una cita que no
   * avisaba. El profesional se quedaba con la hora vieja en el correo y sin el
   * enlace de la sala nueva.
   */
  it('reprogramar le manda al profesional la hora nueva', async () => {
    const { profesional, citaId } = await conCitaProgramada('reprograma')

    const nuevoInicio = martesA(15 * 60, 3)
    const res = await request(app)
      .post(`/api/appointments/${citaId}/reprogramar`)
      .set(agendador())
      .send({
        inicio: nuevoInicio.toISOString(),
        fin: new Date(nuevoInicio.getTime() + 45 * 60000).toISOString(),
      })

    expect(res.status).toBe(201)

    const nueva = res.body.data.id
    const aviso = await prisma.notification.findFirst({
      where: { template: 'CITA_AGENDADA', entityId: nueva },
    })
    expect(aviso).not.toBeNull()
    expect(aviso.toEmail).toBe(profesional.email.toLowerCase())

    // La vieja queda en el historial, no borrada.
    const vieja = await prisma.appointment.findUnique({ where: { id: citaId } })
    expect(vieja.status).toBe('REPROGRAMADA')
    expect(vieja.rescheduledToId).toBe(nueva)
  })

  /** El enlace escrito a mano se guardaba... y se descartaba en silencio. */
  it('el enlace de reunión propio se conserva al reprogramar', async () => {
    const { citaId } = await conCitaProgramada('enlace')

    const nuevoInicio = martesA(16 * 60, 3)
    const res = await request(app)
      .post(`/api/appointments/${citaId}/reprogramar`)
      .set(agendador())
      .send({
        inicio: nuevoInicio.toISOString(),
        fin: new Date(nuevoInicio.getTime() + 45 * 60000).toISOString(),
        meetingUrl: 'https://meet.example.org/sala-propia',
      })

    expect(res.status).toBe(201)
    const nueva = await prisma.appointment.findUnique({ where: { id: res.body.data.id } })
    expect(nueva.meetingUrl).toBe('https://meet.example.org/sala-propia')
  })
})

// --------------------------------------------------------------------- cierre

describe('cerrar el acompañamiento', () => {
  /**
   * Cerrar hacía un update directo, sin pasar por la máquina de estados, y no
   * tocaba las citas. Una sesión confirmada sobrevivía al cierre: seguía
   * ocupando la agenda del profesional, disparando su recordatorio y abriendo
   * una sala, mientras la ficha ya decía CERRADO.
   */
  it('cancela las sesiones que quedaban por delante', async () => {
    const profesional = await crearProfesional({ sufijo: 'cierre' })
    const persona = await crearPersona('cierre')

    await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    const inicio = martesA(12 * 60)
    const cita = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: profesional.id,
        patientId: persona.id,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
        modalidad: 'VIRTUAL',
      })

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })

    const res = await request(app)
      .post(`/api/appointments/asignaciones/${asignacion.id}/cerrar`)
      .set(agendador())
      .send({ motivo: 'El acompañamiento terminó' })

    expect(res.status).toBe(200)

    const cerrada = await prisma.caseAssignment.findUnique({ where: { id: asignacion.id } })
    expect(cerrada.status).toBe('CERRADA')

    const laCita = await prisma.appointment.findUnique({ where: { id: cita.body.data.id } })
    expect(laCita.status).toBe('CANCELADA')
    expect(laCita.cancelReason).toMatch(/se cerró/i)

    const ficha = await prisma.patient.findUnique({ where: { id: persona.id } })
    expect(ficha.status).toBe('CERRADO')
  })

  /** Y no se puede cerrar dos veces: la segunda dice por qué, no explota. */
  it('cerrar un caso ya cerrado se rechaza con un motivo legible', async () => {
    const profesional = await crearProfesional({ sufijo: 'doblecierre' })
    const persona = await crearPersona('doblecierre')

    await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: profesional.id, patientId: persona.id })

    const inicio = martesA(13 * 60)
    await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: profesional.id,
        patientId: persona.id,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
        modalidad: 'VIRTUAL',
      })

    const asignacion = await prisma.caseAssignment.findFirst({ where: { patientId: persona.id } })
    const ruta = `/api/appointments/asignaciones/${asignacion.id}/cerrar`

    await request(app).post(ruta).set(agendador()).send({ motivo: 'Terminó' })
    const segunda = await request(app).post(ruta).set(agendador()).send({ motivo: 'Otra vez' })

    expect(segunda.status).toBe(422)
    expect(segunda.body.message).toMatch(/ya está cerrado/i)
  })
})
