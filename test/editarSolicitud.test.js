import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `edit-${Date.now()}`
const ADMIN = `admin.${marca}@pruebas.local`
const AGENDADOR = `agenda.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * Corregir los datos de una solicitud desde el portal.
 *
 * Llegan con el teléfono mal digitado o el nombre a medias, y la única salida
 * era borrarla y pedirle a la persona que volviera a llenar el formulario — a
 * alguien que ya pidió ayuda una vez.
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

async function token(email) {
  const r = await request(app).post('/api/auth/login').send({ email, password: CLAVE })
  return r.body.data.token
}

beforeAll(async () => {
  const admin = await crearUsuario(ADMIN, 'ADMIN')
  const agendador = await crearUsuario(AGENDADOR, 'AGENDADOR')

  // Una solicitud sin admitir.
  const sola = await prisma.supportRequest.create({
    data: { name: 'Nombre Malo', phone: '3000000001', city: 'Cali', dataConsent: true },
  })

  // Otra ya admitida: la persona lleva una copia de estos datos.
  const admitida = await prisma.supportRequest.create({
    data: {
      name: 'Con Typo',
      phone: '3111111111',
      email: 'viejo@pruebas.local',
      city: 'Pereira',
      dataConsent: true,
      status: 'ACTIVO',
    },
  })
  const persona = await prisma.patient.create({
    data: {
      supportRequestId: admitida.id,
      fullName: 'Con Typo',
      phone: '3111111111',
      email: 'viejo@pruebas.local',
      city: 'Pereira',
      status: 'EN_ADMISION',
    },
  })

  Object.assign(ids, {
    admin: admin.id,
    agendador: agendador.id,
    sola: sola.id,
    admitida: admitida.id,
    persona: persona.id,
  })
})

afterAll(async () => {
  /**
   * Con guarda. Sin ella, si el montaje falla los ids quedan sin valor, y un
   * deleteMany con id indefinido no borra una fila: las borra TODAS. Esta
   * base la comparten las demás pruebas.
   */
  const vivos = (xs) => xs.filter(Boolean)
  if (vivos([ids.admin, ids.agendador, ids.sola, ids.admitida, ids.persona]).length === 0) return

  await prisma.auditLog.deleteMany({ where: { actorEmail: { in: [ADMIN, AGENDADOR] } } })
  if (ids.persona) await prisma.patient.deleteMany({ where: { id: ids.persona } })
  await prisma.supportRequest.deleteMany({ where: { id: { in: vivos([ids.sola, ids.admitida]) } } })
  await prisma.session.deleteMany({ where: { userId: { in: vivos([ids.admin, ids.agendador]) } } })
  await prisma.user.deleteMany({ where: { id: { in: vivos([ids.admin, ids.agendador]) } } })
})

const editar = async (id, datos, quien = ADMIN) =>
  request(app)
    .patch(`/api/support-requests/${id}`)
    .set('Authorization', `Bearer ${await token(quien)}`)
    .send(datos)

describe('corregir una solicitud', () => {
  it('el administrador arregla nombre, teléfono y correo', async () => {
    const res = await editar(ids.sola, {
      name: 'Nombre Bueno',
      phone: '3009999999',
      email: 'BUENO@Pruebas.Local',
    })
    expect(res.status).toBe(200)

    const s = await prisma.supportRequest.findUnique({ where: { id: ids.sola } })
    expect(s.name).toBe('Nombre Bueno')
    expect(s.phone).toBe('3009999999')
    // El correo se normaliza en minúscula, como en el formulario público.
    expect(s.email).toBe('bueno@pruebas.local')
  })

  it('deja rastro de lo que había antes', async () => {
    const huella = await prisma.auditLog.findFirst({
      where: { entity: 'solicitud', entityId: ids.sola, action: 'editar' },
      orderBy: { createdAt: 'desc' },
    })
    expect(huella.before.name).toBe('Nombre Malo')
    expect(huella.after.name).toBe('Nombre Bueno')
  })

  it('un correo vacío se guarda como «sin correo», no como cadena vacía', async () => {
    await editar(ids.sola, { email: '' })
    const s = await prisma.supportRequest.findUnique({ where: { id: ids.sola } })
    expect(s.email).toBeNull()
  })
})

/**
 * Lo que de verdad importa. La admisión COPIA estos datos al crear la persona,
 * y a partir de ahí es la persona —no la solicitud— la que alimenta los
 * enlaces de WhatsApp, los correos y la agenda. Corregir solo la solicitud
 * dejaría el número bueno en una pantalla que ya nadie mira y el malo en todas
 * las que sí.
 */
describe('si ya fue admitida, la corrección llega también a la persona', () => {
  it('arregla el teléfono en los dos sitios de una vez', async () => {
    const res = await editar(ids.admitida, { phone: '3157654321', name: 'Sin Typo' })
    expect(res.status).toBe(200)
    expect(res.body.meta.personaCorregida).toBe(true)

    const persona = await prisma.patient.findUnique({ where: { id: ids.persona } })
    expect(persona.phone).toBe('3157654321')
    expect(persona.fullName).toBe('Sin Typo')
  })

  it('y lo anota en la auditoría, para que se sepa que se tocaron dos registros', async () => {
    const huella = await prisma.auditLog.findFirst({
      where: { entity: 'solicitud', entityId: ids.admitida, action: 'editar' },
      orderBy: { createdAt: 'desc' },
    })
    expect(huella.after.personaCorregida).toBe(ids.persona)
  })
})

describe('lo que no se puede tocar', () => {
  /**
   * Las autorizaciones no son campos: son el registro de lo que una persona
   * aceptó, con su versión y su fecha. Editarlas sería reescribir un
   * consentimiento en nombre de quien lo dio.
   */
  it('las autorizaciones se rechazan, no se ignoran en silencio', async () => {
    const res = await editar(ids.sola, { dataConsent: false })
    expect(res.status).toBe(422)
    const s = await prisma.supportRequest.findUnique({ where: { id: ids.sola } })
    expect(s.dataConsent).toBe(true)
  })

  it('el estado tampoco: admitir y descartar tienen su propio camino', async () => {
    const res = await editar(ids.sola, { status: 'ADMITIDO' })
    expect(res.status).toBe(422)
  })

  it('ni el nombre ni el teléfono pueden quedar vacíos', async () => {
    expect((await editar(ids.sola, { name: '' })).status).toBe(422)
    expect((await editar(ids.sola, { phone: '' })).status).toBe(422)
  })

  it('un teléfono con letras se rechaza', async () => {
    expect((await editar(ids.sola, { phone: 'no es un número' })).status).toBe(422)
  })
})

describe('quién puede', () => {
  it('el agendador no', async () => {
    const res = await editar(ids.sola, { city: 'Medellín' }, AGENDADOR)
    expect(res.status).toBe(403)
  })

  it('sin sesión, tampoco', async () => {
    const res = await request(app)
      .patch(`/api/support-requests/${ids.sola}`)
      .send({ city: 'Medellín' })
    expect(res.status).toBe(401)
  })

  it('una solicitud que no existe da 404, no 500', async () => {
    const res = await editar('00000000-0000-4000-8000-000000000000', { city: 'Cali' })
    expect(res.status).toBe(404)
  })
})
