import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `contacto-${Date.now()}`
const AGENDADOR = `agenda.${marca}@pruebas.local`
const LECTURA = `lectura.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * A quién no se ha podido contactar para agendar.
 *
 * Se llama, se escribe por WhatsApp, y nada: o no contesta, o el número quedó
 * mal escrito en la solicitud. Esa persona se quedaba en «Por asignar» sin
 * decir por qué, mezclada con las que sí esperan a que alguien las asigne — la
 * columna crecía y no se distinguía un caso pendiente de un teléfono que no
 * responde.
 *
 * Lo que estas pruebas fijan: que marcar no toque el estado del caso, que la
 * fecha del primer intento no se pise, que el tablero las separe de verdad, y
 * que asignar borre la marca — porque una persona con profesional asignado en
 * la columna «No contestan» haría que nadie se creyera esa columna.
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
  const agendador = await crearUsuario(AGENDADOR, 'AGENDADOR')
  const lectura = await crearUsuario(LECTURA, 'LECTURA')

  const persona = await prisma.patient.create({
    data: {
      fullName: `Sin Contacto ${marca}`,
      phone: '3000000000',
      city: 'Pereira',
      status: 'EN_ADMISION',
      priority: 'ALTA',
      preferredModality: 'VIRTUAL',
      availableDays: [],
      availableSlots: [],
    },
  })

  Object.assign(ids, { agendador: agendador.id, lectura: lectura.id, persona: persona.id })
})

afterAll(async () => {
  if (!ids.persona) return
  await prisma.auditLog.deleteMany({ where: { actorEmail: { in: [AGENDADOR, LECTURA] } } })
  await prisma.patientNote.deleteMany({ where: { patientId: ids.persona } })
  await prisma.patient.deleteMany({ where: { id: ids.persona } })
  const usuarios = [ids.agendador, ids.lectura].filter(Boolean)
  await prisma.session.deleteMany({ where: { userId: { in: usuarios } } })
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } })
})

const marcar = async (cuerpo, quien = AGENDADOR) =>
  request(app)
    .post(`/api/patients/${ids.persona}/sin-contacto`)
    .set('Authorization', `Bearer ${await token(quien)}`)
    .send(cuerpo)

describe('no se logra contactar a la persona', () => {
  it('el voluntario digital lo marca: es quien llama', async () => {
    const res = await marcar({ motivo: 'NO_CONTESTA' })
    expect(res.status).toBe(200)
    expect(res.body.data.sinContacto.motivo).toBe('NO_CONTESTA')
    expect(res.body.data.sinContacto.intentos).toBe(1)
    expect(res.body.data.sinContacto.quien).toBe('Usuario AGENDADOR')
  })

  /**
   * No es un estado del caso. Con ella no ha pasado nada: lo que no hemos
   * conseguido es hablarle.
   */
  it('marcar no toca el estado del caso', async () => {
    const persona = await prisma.patient.findUnique({ where: { id: ids.persona } })
    expect(persona.status).toBe('EN_ADMISION')
  })

  /**
   * La fecha del primer intento es la que dice cuánto lleva esperando de
   * verdad; si cada llamada la moviera, alguien de hace tres semanas parecería
   * de ayer.
   */
  it('cada intento suma, y la fecha del primero no se pisa', async () => {
    const primera = await prisma.patient.findUnique({ where: { id: ids.persona } })

    const res = await marcar({ motivo: 'NUMERO_ERRADO', nota: 'El número tiene 9 dígitos.' })
    expect(res.body.data.sinContacto.intentos).toBe(2)
    expect(res.body.data.sinContacto.motivo).toBe('NUMERO_ERRADO')

    const despues = await prisma.patient.findUnique({ where: { id: ids.persona } })
    expect(despues.unreachableSince.toISOString()).toBe(primera.unreachableSince.toISOString())
    expect(despues.unreachableLastAt >= primera.unreachableLastAt).toBe(true)
  })

  /** La nota va al historial de siempre, con su autor y su hora. */
  it('la nota queda como nota de seguimiento', async () => {
    const notas = await prisma.patientNote.findMany({ where: { patientId: ids.persona } })
    expect(notas.some((n) => n.note.includes('9 dígitos'))).toBe(true)
  })

  it('el tablero la saca de «Por asignar» y la pone en «No contestan»', async () => {
    const res = await request(app)
      .get('/api/dashboard/tablero')
      .set('Authorization', `Bearer ${await token(AGENDADOR)}`)

    expect(res.status).toBe(200)
    const enPorAsignar = res.body.data.porAsignar.map((p) => p.id)
    const enNoContestan = res.body.data.noContestan.map((p) => p.id)
    expect(enPorAsignar).not.toContain(ids.persona)
    expect(enNoContestan).toContain(ids.persona)
  })

  it('quien solo lee no marca nada', async () => {
    const res = await marcar({ motivo: 'NO_CONTESTA' }, LECTURA)
    expect(res.status).toBe(403)
  })

  it('el motivo tiene que ser uno de los tres', async () => {
    const res = await marcar({ motivo: 'SE_MUDO' })
    expect(res.status).toBe(422)
  })

  it('cuando por fin contesta, la marca se va entera', async () => {
    const res = await request(app)
      .delete(`/api/patients/${ids.persona}/sin-contacto`)
      .set('Authorization', `Bearer ${await token(AGENDADOR)}`)

    expect(res.status).toBe(200)
    expect(res.body.data.sinContacto).toBeNull()

    const persona = await prisma.patient.findUnique({ where: { id: ids.persona } })
    // El contador también: si vuelve a perderse el contacto, eso es una racha
    // nueva y no la continuación de la de hace dos meses.
    expect(persona.unreachableTries).toBe(0)
  })
})
