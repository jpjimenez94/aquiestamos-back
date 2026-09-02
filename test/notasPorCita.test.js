import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `notas-${Date.now()}`
const CORREO = `admin.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}
const hace = (h) => new Date(Date.now() - h * 3600000)

/**
 * Cada nota dice de qué sesión es, y cada sesión sabe si tiene nota.
 *
 * La ficha enseñaba tres citas arriba y una nota abajo sin decir de cuál era.
 * Los reportes cuelgan de la asignación, no de la cita, así que quien
 * coordina tenía que adivinar por la fecha — y con dos citas a la misma hora
 * en días distintos, ni eso.
 */
beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: CORREO,
      name: 'Admin notas',
      passwordHash: await hashearClave(CLAVE),
      role: 'ADMIN',
      roles: ['ADMIN'],
      active: true,
      mustChangePassword: false,
    },
  })
  const profesional = await prisma.professional.create({
    data: {
      fullName: `Profesional ${marca}`,
      email: `prof.${marca}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
    },
  })
  const persona = await prisma.patient.create({
    data: {
      fullName: `Persona ${marca}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      preferredModality: 'VIRTUAL',
    },
  })
  const asignacion = await prisma.caseAssignment.create({
    data: { patientId: persona.id, professionalId: profesional.id, status: 'ACTIVA' },
  })
  const comun = { patientId: persona.id, professionalId: profesional.id, caseAssignmentId: asignacion.id, modality: 'VIRTUAL' }

  // Dos sesiones pasadas y una futura. Solo la primera tiene nota.
  const primera = await prisma.appointment.create({
    data: { ...comun, startsAt: hace(72), endsAt: hace(71), status: 'CONFIRMADA' },
  })
  const segunda = await prisma.appointment.create({
    data: { ...comun, startsAt: hace(24), endsAt: hace(23), status: 'CONFIRMADA' },
  })
  const futura = await prisma.appointment.create({
    data: { ...comun, startsAt: hace(-48), endsAt: new Date(hace(-48).getTime() + 45 * 60000), status: 'CONFIRMADA' },
  })
  // La nota se escribió una hora después de la PRIMERA sesión: es suya, no de
  // la segunda, aunque la segunda también sea pasada.
  const nota = await prisma.caseReport.create({
    data: {
      assignmentId: asignacion.id,
      outcome: 'YA_ATENDIDA',
      followUp: 'NECESITA_MAS',
      reportedByEmail: `prof.${marca}@pruebas.local`,
      createdAt: new Date(primera.startsAt.getTime() + 3600000),
    },
  })

  Object.assign(ids, { usuario: usuario.id, profesional: profesional.id, persona: persona.id, asignacion: asignacion.id, primera: primera.id, segunda: segunda.id, futura: futura.id, nota: nota.id })
})

afterAll(async () => {
  await prisma.caseReport.deleteMany({ where: { assignmentId: ids.asignacion } })
  await prisma.appointment.deleteMany({ where: { patientId: ids.persona } })
  await prisma.caseAssignment.deleteMany({ where: { id: ids.asignacion } })
  await prisma.patient.deleteMany({ where: { id: ids.persona } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
  await prisma.session.deleteMany({ where: { userId: ids.usuario } })
  await prisma.auditLog.deleteMany({ where: { actorEmail: CORREO } })
  await prisma.user.deleteMany({ where: { id: ids.usuario } })
})

async function ficha() {
  const login = await request(app).post('/api/auth/login').send({ email: CORREO, password: CLAVE })
  const res = await request(app)
    .get(`/api/patients/${ids.persona}`)
    .set('Authorization', `Bearer ${login.body.data.token}`)
  expect(res.status).toBe(200)
  return res.body.data
}

describe('la ficha de la persona', () => {
  it('cada cita dice si tiene nota, y cuál', async () => {
    const d = await ficha()
    const porId = Object.fromEntries(d.citas.map((c) => [c.id, c]))
    expect(porId[ids.primera].reporteId).toBe(ids.nota)
    // La segunda también pasó, pero la nota es de la primera: no se la roba.
    expect(porId[ids.segunda].reporteId).toBeNull()
    expect(porId[ids.futura].reporteId).toBeNull()
  })

  it('cada nota dice de qué sesión es', async () => {
    const d = await ficha()
    const nota = d.reportes.find((r) => r.id === ids.nota)
    const primera = d.citas.find((c) => c.id === ids.primera)
    expect(nota.citaId).toBe(ids.primera)
    // La misma fecha que enseña la fila de la cita: si difirieran, la ficha
    // diría dos cosas sobre la misma sesión.
    expect(new Date(nota.citaInicio).getTime()).toBe(new Date(primera.inicio).getTime())
  })
})
