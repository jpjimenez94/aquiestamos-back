import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { hashearClave } from '../../src/auth/password.js'
import { deLocalAUtc } from '../../src/services/timezone.service.js'

/**
 * El recorrido completo: una postulación y una solicitud entran por el
 * formulario público, se aprueban, se emparejan, se agenda y se reprograma.
 *
 * Es la prueba que más vale: cubre las reglas que la ONG acordó (45 minutos de
 * sesión, 30 de descanso, un profesional por paciente) contra PostgreSQL de
 * verdad, no contra una simulación.
 */

const app = createApp()
const marca = `agenda-${process.pid}`
const CLAVE = 'claveDePrueba2026'

const tokens = {}
const ids = {}

/** Un martes futuro, a la hora local que se pida. */
function martesA(minutosDelDia, semanasAdelante = 2) {
  const base = new Date()
  base.setDate(base.getDate() + semanasAdelante * 7)
  while (base.getDay() !== 2) base.setDate(base.getDate() + 1)
  return deLocalAUtc(base.getFullYear(), base.getMonth() + 1, base.getDate(), minutosDelDia)
}

async function entrar(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: CLAVE })
  return res.body.data.token
}

beforeAll(async () => {
  for (const role of ['ADMIN', 'AGENDADOR']) {
    const email = `${role.toLowerCase()}.${marca}@pruebas.local`
    await prisma.user.create({
      data: { email, name: `Prueba ${role}`, role, passwordHash: await hashearClave(CLAVE), mustChangePassword: false },
    })
    tokens[role] = await entrar(email)
  }
}, 40000)

afterAll(async () => {
  // Se borra en orden inverso a las dependencias.
  await prisma.appointment.deleteMany({ where: { professional: { email: { contains: marca } } } })
  await prisma.caseAssignment.deleteMany({ where: { professional: { email: { contains: marca } } } })
  await prisma.availabilityRule.deleteMany({ where: { professional: { email: { contains: marca } } } })
  await prisma.availabilityException.deleteMany({ where: { professional: { email: { contains: marca } } } })
  await prisma.professional.deleteMany({ where: { email: { contains: marca } } })
  await prisma.patient.deleteMany({ where: { fullName: { contains: marca } } })
  await prisma.volunteer.deleteMany({ where: { email: { contains: marca } } })
  await prisma.supportRequest.deleteMany({ where: { name: { contains: marca } } })

  const usuarios = await prisma.user.findMany({ where: { email: { contains: marca } } })
  const idsUsuarios = usuarios.map((u) => u.id)
  await prisma.session.deleteMany({ where: { userId: { in: idsUsuarios } } })
  await prisma.auditLog.deleteMany({ where: { actorId: { in: idsUsuarios } } })
  await prisma.user.deleteMany({ where: { id: { in: idsUsuarios } } })
  await prisma.$disconnect()
})

const admin = () => ({ Authorization: `Bearer ${tokens.ADMIN}` })
const agendador = () => ({ Authorization: `Bearer ${tokens.AGENDADOR}` })

describe('1 · del formulario público a la entidad operativa', () => {
  it('una postulación entra sin sesión', async () => {
    const res = await request(app).post('/api/volunteers').send({
      fullName: `Profesional ${marca}`,
      phone: '3001234567',
      email: `pro.${marca}@pruebas.local`,
      city: 'Manizales',
      profession: 'Psicóloga clínica',
      yearsExperience: 'MAS_DE_5',
      professionalCard: 'SI',
      populations: ['Niños y niñas', 'Familias'],
      crisisExperience: 'SI',
      modality: 'VIRTUAL',
      availableDays: ['MARTES', 'JUEVES'],
      availableSlots: ['TARDE'],
      weeklyHours: 'ENTRE_4_Y_6',
      consentVersion: '2026-08',
      dataConsent: true,
    })
    expect(res.status).toBe(201)

    const guardada = await prisma.volunteer.findFirst({ where: { email: `pro.${marca}@pruebas.local` } })
    ids.volunteerId = guardada.id
  })

  it('una solicitud entra sin sesión', async () => {
    const res = await request(app).post('/api/support-requests').send({
      forWhom: 'PARA_MI',
      name: `Persona ${marca}`,
      phone: '3009876543',
      preferredContact: 'WHATSAPP',
      city: 'Manizales',
      preferredModality: 'VIRTUAL',
      availableDays: ['MARTES'],
      availableSlots: ['TARDE'],
      consentVersion: '2026-08',
      dataConsent: true,
      sensitiveDataConsent: true,
    })
    expect(res.status).toBe(201)

    const guardada = await prisma.supportRequest.findFirst({ where: { name: `Persona ${marca}` } })
    ids.supportRequestId = guardada.id
  })

  it('el agendador SÍ puede aprobar: es quien opera la entrada', async () => {
    // Antes esto era un 403 y cada aprobación esperaba a la administración.
    // La red decidió que quien agenda también aprueba. La prueba de abajo
    // hace la aprobación real con el administrador sobre otra postulación.
    const otra = await prisma.volunteer.create({
      data: {
        fullName: `Aprobada Por Agenda ${marca}`,
        phone: '3001112288',
        email: `agenda-aprueba.${marca}@pruebas.local`,
        city: 'Ibagué',
        profession: 'Psicología',
        yearsExperience: 'ENTRE_1_Y_3',
        professionalCard: 'SI',
        populations: ['Adultos'],
        crisisExperience: 'SI',
        modality: 'VIRTUAL',
        availableDays: ['MARTES'],
        availableSlots: ['TARDE'],
        weeklyHours: 'ENTRE_1_Y_3',
        consentVersion: '2026-08',
        dataConsent: true,
      },
    })

    const res = await request(app)
      .post(`/api/professionals/aprobar/${otra.id}`)
      .set(agendador())
      .send({ status: 'ACTIVO' })
    expect(res.status).toBe(201)

    // El agendador sí puede listar profesionales
    const lista = await request(app).get('/api/professionals').set(agendador())
    expect(lista.status).toBe(200)

    await prisma.availabilityRule.deleteMany({
      where: { professional: { email: `agenda-aprueba.${marca}@pruebas.local` } },
    })
    await prisma.professional.deleteMany({
      where: { email: `agenda-aprueba.${marca}@pruebas.local` },
    })
    await prisma.volunteer.delete({ where: { id: otra.id } })
  })

  it('el administrador aprueba, y las franjas del formulario se convierten en disponibilidad', async () => {
    const res = await request(app)
      .post(`/api/professionals/aprobar/${ids.volunteerId}`)
      .set(admin())
      .send({ status: 'ACTIVO' })

    expect(res.status).toBe(201)
    ids.professionalId = res.body.data.id

    const reglas = await prisma.availabilityRule.findMany({ where: { professionalId: ids.professionalId } })
    // Dos días × una franja = dos reglas
    expect(reglas.length).toBe(2)
    expect(reglas.every((r) => r.startMinute === 12 * 60 && r.endMinute === 18 * 60)).toBe(true)
  })

  it('aprobar dos veces la misma postulación falla', async () => {
    const res = await request(app)
      .post(`/api/professionals/aprobar/${ids.volunteerId}`)
      .set(admin())
      .send({})
    expect(res.status).toBe(400)
  })

  it('no se puede admitir sin decidir la prioridad', async () => {
    // La prioridad ordena la cola de pendientes por asignar. Si tuviera valor
    // por defecto, todo quedaría en "media" y la cola dejaría de ordenar nada.
    const otra = await prisma.supportRequest.create({
      data: {
        name: `Sin prioridad ${marca}`,
        phone: '3001112299',
        city: 'Ibagué',
        preferredContact: 'WHATSAPP',
        preferredModality: 'VIRTUAL',
        availableDays: ['MARTES'],
        availableSlots: ['TARDE'],
        consentVersion: '2026-08',
        dataConsent: true,
        sensitiveDataConsent: true,
      },
    })

    const res = await request(app)
      .post(`/api/patients/admitir/${otra.id}`)
      .set(admin())
      .send({})

    expect(res.status).toBe(422)
    expect(res.body.details.priority).toBeTruthy()

    await prisma.supportRequest.delete({ where: { id: otra.id } })
  })

  it('el administrador admite la solicitud y se copian sus preferencias', async () => {
    const res = await request(app)
      .post(`/api/patients/admitir/${ids.supportRequestId}`)
      .set(admin())
      .send({ priority: 'ALTA' })

    expect(res.status).toBe(201)
    ids.patientId = res.body.data.id

    const paciente = await prisma.patient.findUnique({ where: { id: ids.patientId } })
    expect(paciente.availableDays).toEqual(['MARTES'])
    expect(paciente.priority).toBe('ALTA')
    expect(paciente.availableSlots).toEqual(['TARDE'])
  })
})

describe('2 · emparejamiento', () => {
  it('propone al profesional con su carga y su primer hueco', async () => {
    const res = await request(app)
      .get(`/api/patients/${ids.patientId}/candidatos`)
      .set(agendador())

    expect(res.status).toBe(200)
    const candidato = res.body.data.candidatos.find((c) => c.id === ids.professionalId)
    expect(candidato).toBeTruthy()
    expect(candidato.carga).toBe(0)
    expect(candidato.cupo).toBe(3)
    expect(candidato.huecosLibres).toBeGreaterThan(0)
    expect(candidato.primerHueco).toBeTruthy()
    expect(candidato.razones.length).toBeGreaterThan(0)
  })
})

describe('3 · asignación', () => {
  it('el agendador asigna el caso', async () => {
    const res = await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: ids.professionalId, patientId: ids.patientId })

    expect(res.status).toBe(201)
    ids.asignacionId = res.body.data.id
  })

  it('una segunda asignación activa para la misma persona se rechaza', async () => {
    const otro = await prisma.professional.create({
      data: {
        fullName: `Otro ${marca}`,
        email: `otro.${marca}@pruebas.local`,
        phone: '3001111111',
        city: 'Manizales',
        profession: 'Psicólogo',
        populations: ['Adultos'],
        modality: 'VIRTUAL',
        status: 'ACTIVO',
      },
    })

    const res = await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: otro.id, patientId: ids.patientId })

    expect(res.status).toBe(409)
    expect(res.body.details.codigo).toBe('YA_TIENE_PROFESIONAL')
  })
})

describe('4 · agenda: las reglas de 45 y 30 minutos', () => {
  it('agenda una sesión de 45 minutos un martes por la tarde', async () => {
    const inicio = martesA(14 * 60)
    const fin = new Date(inicio.getTime() + 45 * 60000)

    const res = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: ids.professionalId,
        patientId: ids.patientId,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
      })

    expect(res.status).toBe(201)
    expect(res.body.data.duracionMinutos).toBe(45)
    expect(res.body.data.descansoMinutos).toBe(30)
    ids.citaId = res.body.data.id
    ids.inicioCita = inicio
  })

  it('rechaza una sesión de 30 minutos', async () => {
    const inicio = martesA(16 * 60)
    const res = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: ids.professionalId,
        patientId: ids.patientId,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 30 * 60000).toISOString(),
      })

    expect(res.status).toBe(422)
    expect(res.body.details.codigo).toBe('DURACION_INSUFICIENTE')
  })

  it('rechaza otra cita a 15 minutos de la anterior: invade el descanso', async () => {
    const inicio = new Date(ids.inicioCita.getTime() + 60 * 60000) // 45 + 15
    const res = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: ids.professionalId,
        patientId: ids.patientId,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
      })

    expect([409, 422]).toContain(res.status)
  })

  it('rechaza una cita fuera de las franjas declaradas', async () => {
    const inicio = martesA(9 * 60) // por la mañana, y solo declaró tardes
    const res = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: ids.professionalId,
        patientId: ids.patientId,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
      })

    expect(res.status).toBe(422)
    expect(res.body.details.codigo).toBe('FUERA_DE_FRANJA')
  })

  it('rechaza una cita en el pasado', async () => {
    const inicio = new Date(Date.now() - 86400000)
    const res = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: ids.professionalId,
        patientId: ids.patientId,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
      })

    expect(res.status).toBe(422)
    expect(res.body.details.codigo).toBe('EN_EL_PASADO')
  })

  it('acepta otra cita justo después del descanso', async () => {
    const inicio = new Date(ids.inicioCita.getTime() + 75 * 60000) // 45 + 30
    const res = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: ids.professionalId,
        patientId: ids.patientId,
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 45 * 60000).toISOString(),
      })

    expect(res.status).toBe(201)
    ids.segundaCitaId = res.body.data.id
  })

  it('los huecos libres ya no incluyen las horas ocupadas', async () => {
    const desde = new Date(ids.inicioCita.getTime() - 3 * 86400000)
    const hasta = new Date(ids.inicioCita.getTime() + 3 * 86400000)

    const res = await request(app)
      .get('/api/appointments/huecos')
      .query({ professionalId: ids.professionalId, desde: desde.toISOString(), hasta: hasta.toISOString() })
      .set(agendador())

    expect(res.status).toBe(200)
    const ocupado = ids.inicioCita.toISOString()
    expect(res.body.data.some((h) => h.inicio === ocupado)).toBe(false)
  })
})

describe('5 · estados y reprogramación', () => {
  it('confirma la cita', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${ids.citaId}/estado`)
      .set(agendador())
      .send({ estado: 'CONFIRMADA' })

    expect(res.status).toBe(200)
    expect(res.body.data.estado).toBe('CONFIRMADA')
  })

  it('cancelar sin motivo se rechaza', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${ids.segundaCitaId}/estado`)
      .set(agendador())
      .send({ estado: 'CANCELADA' })

    expect(res.status).toBe(422)
  })

  it('cancelar con motivo libera la franja', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${ids.segundaCitaId}/estado`)
      .set(agendador())
      .send({ estado: 'CANCELADA', motivo: 'La persona pidió moverla' })

    expect(res.status).toBe(200)
    expect(res.body.data.estado).toBe('CANCELADA')

    // La franja liberada vuelve a estar disponible.
    const cancelada = await prisma.appointment.findUnique({ where: { id: ids.segundaCitaId } })
    const res2 = await request(app)
      .post('/api/appointments')
      .set(agendador())
      .send({
        professionalId: ids.professionalId,
        patientId: ids.patientId,
        inicio: cancelada.startsAt.toISOString(),
        fin: cancelada.endsAt.toISOString(),
      })
    expect(res2.status).toBe(201)
    ids.terceraCitaId = res2.body.data.id
  })

  it('no se puede marcar como realizada una cita cancelada', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${ids.segundaCitaId}/estado`)
      .set(agendador())
      .send({ estado: 'REALIZADA' })

    expect(res.status).toBe(422)
    expect(res.body.details.codigo).toBe('TRANSICION_INVALIDA')
  })

  it('reprogramar crea una cita nueva y enlaza la vieja', async () => {
    const nuevoInicio = martesA(14 * 60, 3)
    const res = await request(app)
      .post(`/api/appointments/${ids.citaId}/reprogramar`)
      .set(agendador())
      .send({
        inicio: nuevoInicio.toISOString(),
        fin: new Date(nuevoInicio.getTime() + 45 * 60000).toISOString(),
      })

    expect(res.status).toBe(201)

    const vieja = await prisma.appointment.findUnique({ where: { id: ids.citaId } })
    expect(vieja.status).toBe('REPROGRAMADA')
    expect(vieja.rescheduledToId).toBe(res.body.data.id)
  })
})

describe('6 · fronteras de rol', () => {
  it('el agendador no puede editar un profesional', async () => {
    const res = await request(app)
      .patch(`/api/professionals/${ids.professionalId}`)
      .set(agendador())
      .send({ maxActiveCases: 99 })
    expect(res.status).toBe(403)
  })

  it('el agendador no puede borrar una persona', async () => {
    const res = await request(app).delete(`/api/patients/${ids.patientId}`).set(agendador())
    expect(res.status).toBe(403)
  })

  it('el agendador no ve las notas internas del profesional', async () => {
    await prisma.professional.update({
      where: { id: ids.professionalId },
      data: { notes: 'NOTA-INTERNA-CONFIDENCIAL' },
    })

    const comoAgendador = await request(app)
      .get(`/api/professionals/${ids.professionalId}`)
      .set(agendador())
    expect(JSON.stringify(comoAgendador.body)).not.toContain('NOTA-INTERNA-CONFIDENCIAL')

    const comoAdmin = await request(app)
      .get(`/api/professionals/${ids.professionalId}`)
      .set(admin())
    expect(JSON.stringify(comoAdmin.body)).toContain('NOTA-INTERNA-CONFIDENCIAL')
  })

  it('no se puede dar de baja a un profesional con casos abiertos', async () => {
    const res = await request(app).delete(`/api/professionals/${ids.professionalId}`).set(admin())
    expect(res.status).toBe(409)
  })
})

describe('7 · cierre del caso', () => {
  it('cerrar la asignación deja a la persona como cerrada', async () => {
    const res = await request(app)
      .post(`/api/appointments/asignaciones/${ids.asignacionId}/cerrar`)
      .set(agendador())
      .send({ motivo: 'Acompañamiento terminado' })

    expect(res.status).toBe(200)

    const paciente = await prisma.patient.findUnique({ where: { id: ids.patientId } })
    expect(paciente.status).toBe('CERRADO')
  })

  it('con el caso cerrado, se le puede asignar otro profesional', async () => {
    const otro = await prisma.professional.findFirst({
      where: { email: `otro.${marca}@pruebas.local` },
    })

    const res = await request(app)
      .post('/api/appointments/asignar')
      .set(agendador())
      .send({ professionalId: otro.id, patientId: ids.patientId })

    expect(res.status).toBe(201)
  })
})

describe('8 · tablero', () => {
  it('devuelve los indicadores de operación', async () => {
    const res = await request(app).get('/api/dashboard').set(admin())
    expect(res.status).toBe(200)
    expect(res.body.data.bandeja).toBeTruthy()
    expect(res.body.data.red).toBeTruthy()
    expect(res.body.data.agenda).toBeTruthy()
    expect(typeof res.body.data.red.profesionalesActivos).toBe('number')
  })
})
