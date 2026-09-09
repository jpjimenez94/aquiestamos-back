import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `nota-${Date.now()}`
const AGENDADOR = `agenda.${marca}@pruebas.local`
const LECTURA = `lectura.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * Corregir una nota de seguimiento ya escrita.
 *
 * Se escriben deprisa y muchas veces con la persona al teléfono: un nombre
 * cambiado, una fecha mal, «Laura» donde iba «Tatiana». Hasta ahora eso se
 * quedaba así para siempre — no había forma de arreglarlo, ni siquiera siendo
 * quien la escribió—, y la única salida era añadir otra nota debajo diciendo
 * que la de arriba estaba mal.
 *
 * Lo que estas pruebas fijan es lo que NO puede torcerse al abrirlo: que el
 * voluntario digital pueda hacerlo —es quien más notas escribe—, que quien
 * solo lee no pueda, que corregir no borre al autor original, y que el texto
 * anterior quede en la auditoría. Una bitácora que se puede reescribir sin
 * dejar rastro deja de ser una bitácora.
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
      fullName: 'Persona De Prueba',
      phone: '3000000000',
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      priority: 'MEDIA',
      preferredModality: 'VIRTUAL',
      availableDays: [],
      availableSlots: [],
    },
  })

  const otra = await prisma.patient.create({
    data: {
      fullName: 'Otra Persona',
      phone: '3000000001',
      city: 'Cali',
      status: 'EN_ACOMPANAMIENTO',
      priority: 'BAJA',
      preferredModality: 'VIRTUAL',
      availableDays: [],
      availableSlots: [],
    },
  })

  const nota = await prisma.patientNote.create({
    data: {
      patientId: persona.id,
      note: 'La profesional Laura no se contactó con la paciente.',
      authorName: 'Sofía Vargas',
      authorEmail: `sofia.${marca}@pruebas.local`,
    },
  })

  const notaDeOtra = await prisma.patientNote.create({
    data: {
      patientId: otra.id,
      note: 'Nota de otra persona.',
      authorName: 'Sofía Vargas',
      authorEmail: `sofia.${marca}@pruebas.local`,
    },
  })

  Object.assign(ids, {
    agendador: agendador.id,
    lectura: lectura.id,
    persona: persona.id,
    otra: otra.id,
    nota: nota.id,
    notaDeOtra: notaDeOtra.id,
  })
})

afterAll(async () => {
  const personas = [ids.persona, ids.otra].filter(Boolean)
  await prisma.auditLog.deleteMany({ where: { actorEmail: { in: [AGENDADOR, LECTURA] } } })
  await prisma.patientNote.deleteMany({ where: { patientId: { in: personas } } })
  await prisma.patient.deleteMany({ where: { id: { in: personas } } })
  const usuarios = [ids.agendador, ids.lectura].filter(Boolean)
  await prisma.session.deleteMany({ where: { userId: { in: usuarios } } })
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } })
})

const corregir = async (texto, quien = AGENDADOR, nota = null, persona = null) =>
  request(app)
    .patch(`/api/patients/${persona ?? ids.persona}/notes/${nota ?? ids.nota}`)
    .set('Authorization', `Bearer ${await token(quien)}`)
    .send({ note: texto })

describe('corregir una nota de seguimiento', () => {
  it('el voluntario digital la corrige: es quien más las escribe', async () => {
    const res = await corregir('La profesional Laura Andrade no se contactó con Tatiana.')
    expect(res.status).toBe(200)
    expect(res.body.data.nota.nota).toContain('Tatiana')
  })

  /**
   * La nota sigue siendo de quien la escribió. Si corregir cambiara el autor,
   * la bitácora diría que la escribió quien solo le arregló una palabra.
   */
  it('el autor original no cambia, y queda dicho quién la corrigió', async () => {
    const res = await corregir('Otra corrección más.')
    expect(res.body.data.nota.autor).toBe('Sofía Vargas')
    expect(res.body.data.nota.corregidaPor).toBe('Usuario AGENDADOR')
    expect(res.body.data.nota.corregidaEl).toBeTruthy()
  })

  /** Lo que ya no está a la vista tiene que estar en la auditoría. */
  it('el texto anterior queda en la auditoría', async () => {
    await corregir('Texto final de la prueba.')
    const rastro = await prisma.auditLog.findFirst({
      where: { actorEmail: AGENDADOR, entity: 'paciente_nota', entityId: ids.nota },
      orderBy: { createdAt: 'desc' },
    })
    expect(rastro).toBeTruthy()
    expect(JSON.stringify(rastro.before)).toContain('Otra corrección más')
    expect(JSON.stringify(rastro.after)).toContain('Texto final')
  })

  it('quien solo lee no corrige nada', async () => {
    const res = await corregir('No debería poder.', LECTURA)
    expect(res.status).toBe(403)
  })

  /**
   * Sin esta comprobación, con el id de una nota cualquiera se podría editar
   * desde la ficha de cualquier persona.
   */
  it('una nota de otra persona no se toca desde esta ficha', async () => {
    const res = await corregir('Cambio indebido.', AGENDADOR, ids.notaDeOtra)
    expect(res.status).toBe(404)
  })

  it('una nota vacía no es una corrección: es un borrado sin rastro', async () => {
    const res = await corregir('   ')
    // 422: el esquema de Zod lo rechaza antes de llegar al controlador.
    expect(res.status).toBe(422)
  })
})
