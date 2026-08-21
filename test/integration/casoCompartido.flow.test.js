import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'

/**
 * El enlace de caso compartido es la única puerta pública que devuelve datos de
 * un paciente: no pasa por `authenticate`, solo por el enlace más el correo.
 *
 * Estas pruebas fijan las tres cosas de las que depende que eso sea seguro:
 * que el token no se pueda falsificar, que deje de servir cuando el caso se
 * cierra, y que la respuesta no arrastre más campos de los necesarios.
 */

const app = createApp()
const marca = `caso-${process.pid}`
// Con puntos a propósito: es la forma más común de correo y rompía el formato
// anterior de token, que separaba por el primer punto.
const CORREO = `ana.maria.${marca}@ejemplo.com`

const ids = {}

beforeAll(async () => {
  const profesional = await prisma.professional.create({
    data: {
      fullName: 'Ana María Pérez',
      email: CORREO,
      phone: '3001112233',
      city: 'Bogotá',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      status: 'ACTIVO',
      populations: ['Adultos'],
    },
  })

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Paciente ${marca}`,
      phone: '3009998877',
      email: `paciente.${marca}@ejemplo.com`,
      city: 'Medellín',
      preferredModality: 'VIRTUAL',
      preferredContact: 'WHATSAPP',
      availableDays: ['LUNES'],
      availableSlots: ['TARDE'],
      status: 'ASIGNADO',
    },
  })

  const asignacion = await prisma.caseAssignment.create({
    data: { patientId: paciente.id, professionalId: profesional.id, status: 'ACTIVA' },
  })

  Object.assign(ids, {
    profesional: profesional.id,
    paciente: paciente.id,
    asignacion: asignacion.id,
  })
})

afterAll(async () => {
  await prisma.caseReport.deleteMany({ where: { assignmentId: ids.asignacion } })
  await prisma.auditLog.deleteMany({ where: { entityId: ids.paciente } })
  await prisma.caseAssignment.deleteMany({ where: { patientId: ids.paciente } })
  await prisma.patient.deleteMany({ where: { id: ids.paciente } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
  await prisma.$disconnect()
})

async function pedirToken(correo = CORREO) {
  const res = await request(app).post(`/api/shared-cases/${ids.paciente}/auth`).send({ email: correo })
  return res
}

describe('caso compartido', () => {
  it('deja entrar al profesional asignado, aunque su correo tenga puntos', async () => {
    const res = await pedirToken()
    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
  })

  it('no distingue entre un correo ajeno y un caso que no existe', async () => {
    const ajeno = await pedirToken(`otra.persona.${marca}@ejemplo.com`)
    const inventado = await request(app)
      .post('/api/shared-cases/00000000-0000-4000-8000-000000000000/auth')
      .send({ email: CORREO })

    expect(ajeno.status).toBe(403)
    expect(inventado.status).toBe(403)
    // Mismo texto: desde afuera no se puede deducir quién pertenece a la red.
    expect(ajeno.body.message).toBe(inventado.body.message)
  })

  it('entrega solo los campos que el profesional necesita', async () => {
    const { body } = await pedirToken()
    const res = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', body.data.token)

    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data).sort()).toEqual(
      [
        'appointments',
        'availableDays',
        'availableSlots',
        'city',
        'contactName',
        'email',
        'fullName',
        'isMinor',
        'phone',
        'preferredContact',
        'preferredModality',
        'relationship',
        'reportes',
        // Con qué urgencia hay que buscar a la persona. El profesional
        // necesita saberlo tanto como quien coordina.
        'priority',
        'prioridadLegible',
      ].sort(),
    )
    // Lo que no debe salir nunca por esta puerta.
    expect(res.body.data.id).toBeUndefined()
    expect(res.body.data.supportRequestId).toBeUndefined()
    expect(res.body.data.status).toBeUndefined()
  })

  it('rechaza un token manipulado', async () => {
    const { body } = await pedirToken()
    const alterado = body.data.token.slice(0, -1) + (body.data.token.endsWith('a') ? 'b' : 'a')

    const res = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', alterado)

    expect(res.status).toBe(401)
  })

  it('no sirve para leer otro caso', async () => {
    const { body } = await pedirToken()
    const res = await request(app)
      .get(`/api/shared-cases/${ids.profesional}`)
      .set('x-shared-case-token', body.data.token)

    expect(res.status).toBe(401)
  })

  it('deja de servir en cuanto el caso se cierra, sin esperar a que venza', async () => {
    const { body } = await pedirToken()
    const token = body.data.token

    const antes = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', token)
    expect(antes.status).toBe(200)

    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'CERRADA' },
    })

    const despues = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', token)
    expect(despues.status).toBe(403)

    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'ACTIVA' },
    })
  })

  it('deja rastro en auditoría de quien entra y de quien lo intenta', async () => {
    await pedirToken()
    await pedirToken(`intruso.${marca}@ejemplo.com`)

    const registros = await prisma.auditLog.findMany({
      where: { entity: 'CasoCompartido', entityId: ids.paciente },
    })

    expect(registros.some((r) => r.action === 'acceder')).toBe(true)
    expect(registros.some((r) => r.action === 'acceso_fallido')).toBe(true)
  })
})

describe('el profesional responde qué pasó', () => {
  // Un solo token para todo el bloque. Es lo que pasa de verdad —el
  // profesional confirma su correo una vez y de ahí en adelante usa el
  // enlace— y evita chocar con el límite de intentos, que es de diez.
  let t

  beforeAll(async () => {
    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/auth`)
      .send({ email: CORREO })
    t = res.body.data.token
  })

  it('registra lo que pasó y lo devuelve en el propio enlace', async () => {
    const enviado = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t)
      .send({
        outcome: 'NO_CONTESTA',
        contactDifficulties: 'La llamé tres veces y entra a buzón.',
      })
    expect(enviado.status).toBe(201)

    const caso = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', t)

    expect(caso.body.data.reportes).toHaveLength(1)
    expect(caso.body.data.reportes[0].outcome).toBe('NO_CONTESTA')
    // No se le repite su propio correo: ya sabe quién es.
    expect(caso.body.data.reportes[0].reportedByEmail).toBeUndefined()
  })

  it('una cita acordada necesita modalidad y fecha', async () => {
    const incompleto = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t)
      .send({ outcome: 'CITA_ACORDADA' })

    // 422: la petición está bien formada pero rompe una regla del formulario.
    expect(incompleto.status).toBe(422)
    expect(incompleto.body.details.modality).toBeTruthy()
    expect(incompleto.body.details.meetsAt).toBeTruthy()

    const completo = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t)
      .send({
        outcome: 'CITA_ACORDADA',
        modality: 'PRESENCIAL',
        meetsAt: '2026-09-03T20:00:00.000Z',
      })
    expect(completo.status).toBe(201)
  })

  it('no se puede reportar sin el enlace', async () => {
    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .send({ outcome: 'NO_CONTESTA' })
    expect(res.status).toBe(401)
  })

  it('deja de poderse reportar cuando el caso se cierra', async () => {
    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'CERRADA' },
    })

    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t)
      .send({ outcome: 'NO_CONTESTA' })
    expect(res.status).toBe(403)

    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'ACTIVA' },
    })
  })

  it('es una bitácora: los reportes se suman, no se pisan', async () => {
    const antes = await prisma.caseReport.count({ where: { assignmentId: ids.asignacion } })

    await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t)
      .send({ outcome: 'YA_ATENDIDA', modality: 'VIRTUAL' })

    const despues = await prisma.caseReport.count({ where: { assignmentId: ids.asignacion } })
    expect(despues).toBe(antes + 1)
  })
})
