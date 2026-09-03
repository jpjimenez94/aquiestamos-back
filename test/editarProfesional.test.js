import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `profedit-${Date.now()}`
const ADMIN = `admin.${marca}@pruebas.local`
const AGENDADOR = `agenda.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * Corregir los datos de un profesional.
 *
 * El endpoint existía desde hace tiempo y no lo usaba ninguna pantalla, así
 * que tampoco había una prueba que fijara quién puede tocarlo. Ahora hay
 * pantalla —y estas son las dos cosas que no pueden torcerse: que el
 * agendador no edite datos maestros, y que quede rastro de quién cambió qué.
 *
 * El teléfono importa más de lo que parece: es el que abre los WhatsApp que le
 * mandamos. Mal escrito, el profesional no se entera de sus casos.
 */
async function crearUsuario(email, role) {
  return prisma.user.create({
    data: {
      email,
      name: `Usuario ${role}`,
      passwordHash: await hashearClave(CLAVE),
      role,
      roles: [role],
      active: true,
      mustChangePassword: false,
    },
  })
}

const token = async (email) =>
  (await request(app).post('/api/auth/login').send({ email, password: CLAVE })).body.data.token

beforeAll(async () => {
  const admin = await crearUsuario(ADMIN, 'ADMIN')
  const agendador = await crearUsuario(AGENDADOR, 'AGENDADOR')
  const profesional = await prisma.professional.create({
    data: {
      fullName: 'Nombre Con Typo',
      email: `prof.${marca}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
      maxActiveCases: 3,
    },
  })
  Object.assign(ids, { admin: admin.id, agendador: agendador.id, profesional: profesional.id })
})

afterAll(async () => {
  if (!ids.profesional) return
  await prisma.auditLog.deleteMany({ where: { actorEmail: { in: [ADMIN, AGENDADOR] } } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
  const usuarios = [ids.admin, ids.agendador].filter(Boolean)
  await prisma.session.deleteMany({ where: { userId: { in: usuarios } } })
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } })
})

const editar = async (datos, quien = ADMIN) =>
  request(app)
    .patch(`/api/professionals/${ids.profesional}`)
    .set('Authorization', `Bearer ${await token(quien)}`)
    .send(datos)

describe('corregir los datos de un profesional', () => {
  it('el administrador arregla el nombre y el teléfono', async () => {
    const res = await editar({ fullName: 'Nombre Correcto', phone: '3157654321' })
    expect(res.status).toBe(200)

    const p = await prisma.professional.findUnique({ where: { id: ids.profesional } })
    expect(p.fullName).toBe('Nombre Correcto')
    expect(p.phone).toBe('3157654321')
  })

  /**
   * Un dato maestro sin rastro es un dato que nadie puede explicar después:
   * «¿de dónde salió este número?» tiene que tener respuesta.
   */
  it('queda registrado quién lo cambió y qué había antes', async () => {
    const huella = await prisma.auditLog.findFirst({
      where: { entity: 'profesional', entityId: ids.profesional, action: 'editar' },
      orderBy: { createdAt: 'desc' },
    })
    expect(huella).not.toBeNull()
    expect(huella.actorEmail).toBe(ADMIN)
    expect(huella.before.phone).toBe('3000000000')
    expect(huella.after.phone).toBe('3157654321')
  })

  it('un correo inválido se rechaza', async () => {
    expect((await editar({ email: 'esto no es un correo' })).status).toBe(422)
  })

  it('el nombre no puede quedar vacío', async () => {
    expect((await editar({ fullName: '' })).status).toBe(422)
  })

  it('un profesional que no existe da 404, no 500', async () => {
    const res = await request(app)
      .patch('/api/professionals/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${await token(ADMIN)}`)
      .send({ city: 'Cali' })
    expect(res.status).toBe(404)
  })
})

describe('quién puede tocar los datos maestros', () => {
  /**
   * Quien agenda no. Es la misma razón por la que verificar la tarjeta tiene
   * permiso propio: lleva el WhatsApp con el profesional, pero el cupo de
   * casos y el contacto son datos maestros.
   */
  it('el agendador no', async () => {
    const res = await editar({ phone: '3000000009' }, AGENDADOR)
    expect(res.status).toBe(403)

    const p = await prisma.professional.findUnique({ where: { id: ids.profesional } })
    expect(p.phone).toBe('3157654321')
  })

  it('sin sesión, tampoco', async () => {
    const res = await request(app)
      .patch(`/api/professionals/${ids.profesional}`)
      .send({ phone: '3000000009' })
    expect(res.status).toBe(401)
  })
})
