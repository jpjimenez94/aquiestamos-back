import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `ultimasesion-${Date.now()}`
const CORREO = `admin.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}
const hace = (h) => new Date(Date.now() - h * 3600000)

/**
 * La ficha y el tablero dicen lo mismo de la misma sesión.
 *
 * La tarjeta de Sofía decía «Con reporte» sobre su sesión del 4/09 y su ficha
 * decía «Sin reportar» de esa misma sesión. Ninguna de las dos estaba rota por
 * dentro: miraban datos distintos. La ficha empareja cada sesión con su
 * reporte —el primero escrito después de que empezara—; el tablero solo
 * preguntaba «¿esta asignación tiene algún reporte?», y el que tenía era de
 * una sesión de dos semanas antes.
 *
 * Quien coordina lee «Con reporte», deja de perseguir esa nota, y la sesión
 * que sí ocurrió se queda sin contar para siempre.
 *
 * Se reproduce el caso exacto: una sesión reprogramada, una que ocurrió y se
 * reportó, y una tercera que ocurrió y nadie ha reportado.
 */
beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: CORREO,
      name: 'Admin última sesión',
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
  const comun = {
    patientId: persona.id,
    professionalId: profesional.id,
    caseAssignmentId: asignacion.id,
    modality: 'VIRTUAL',
  }

  const movida = await prisma.appointment.create({
    data: { ...comun, startsAt: hace(240), endsAt: hace(239), status: 'REPROGRAMADA' },
  })
  const reportada = await prisma.appointment.create({
    data: { ...comun, startsAt: hace(192), endsAt: hace(191), status: 'REALIZADA' },
  })
  // La de siempre: ocurrió y nadie ha contado cómo fue.
  const sinReportar = await prisma.appointment.create({
    data: { ...comun, startsAt: hace(3), endsAt: hace(2), status: 'REALIZADA' },
  })

  const nota = await prisma.caseReport.create({
    data: {
      assignmentId: asignacion.id,
      outcome: 'YA_ATENDIDA',
      followUp: 'NECESITA_MAS',
      reportedByEmail: `prof.${marca}@pruebas.local`,
      // Hora y media después de la segunda sesión: es de esa, y de ninguna otra.
      createdAt: new Date(hace(192).getTime() + 90 * 60000),
    },
  })

  Object.assign(ids, {
    usuario: usuario.id,
    profesional: profesional.id,
    persona: persona.id,
    asignacion: asignacion.id,
    movida: movida.id,
    reportada: reportada.id,
    sinReportar: sinReportar.id,
    nota: nota.id,
  })
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

async function token() {
  const login = await request(app).post('/api/auth/login').send({ email: CORREO, password: CLAVE })
  return login.body.data.token
}

async function ficha() {
  const res = await request(app)
    .get(`/api/patients/${ids.persona}`)
    .set('Authorization', `Bearer ${await token()}`)
  expect(res.status).toBe(200)
  return res.body.data
}

async function tarjetaDelTablero() {
  const res = await request(app)
    .get('/api/dashboard/tablero')
    .set('Authorization', `Bearer ${await token()}`)
  expect(res.status).toBe(200)
  return res.body.data.enAcompanamiento.find((p) => p.id === ids.persona)
}

describe('el reporte de la última sesión', () => {
  it('la ficha empareja la nota con la sesión que cerró, no con las demás', async () => {
    const d = await ficha()
    const porId = Object.fromEntries(d.citas.map((c) => [c.id, c]))
    expect(porId[ids.reportada].reporteId).toBe(ids.nota)
    expect(porId[ids.sinReportar].reporteId).toBeNull()
  })

  /**
   * Sin cita viva por delante, el caso vive en la columna de acompañamiento.
   * Es la tarjeta de la captura.
   */
  it('el tablero lo pone en acompañamiento y enseña la última sesión', async () => {
    const tarjeta = await tarjetaDelTablero()
    expect(tarjeta).toBeDefined()
    expect(tarjeta.ultimaCita.id).toBe(ids.sinReportar)
  })

  /** El fallo exacto: la asignación SÍ tiene reporte; esa sesión NO. */
  it('el tablero dice «sin reporte» de una sesión sin reportar, aunque el caso tenga notas', async () => {
    const tarjeta = await tarjetaDelTablero()
    expect(tarjeta.ultimoReporte).not.toBeNull()
    expect(tarjeta.ultimaCita.reporte).toBeNull()
  })

  /** Y las dos pantallas responden lo mismo, que es de lo que iba todo esto. */
  it('la ficha y el tablero no se contradicen', async () => {
    const [d, tarjeta] = await Promise.all([ficha(), tarjetaDelTablero()])
    const enLaFicha = d.citas.find((c) => c.id === tarjeta.ultimaCita.id)
    expect(tarjeta.ultimaCita.reporte?.id ?? null).toBe(enLaFicha.reporteId)
  })

  /** Y cuando sí es suya, la enseña —con su desenlace, no con otro. */
  it('con la sesión reportada de última, el tablero la da por reportada', async () => {
    await prisma.appointment.update({
      where: { id: ids.sinReportar },
      data: { startsAt: hace(400), endsAt: hace(399) },
    })
    try {
      const tarjeta = await tarjetaDelTablero()
      expect(tarjeta.ultimaCita.id).toBe(ids.reportada)
      expect(tarjeta.ultimaCita.reporte?.id).toBe(ids.nota)
      expect(tarjeta.ultimaCita.reporte?.outcome).toBe('YA_ATENDIDA')
    } finally {
      await prisma.appointment.update({
        where: { id: ids.sinReportar },
        data: { startsAt: hace(3), endsAt: hace(2) },
      })
    }
  })
})
