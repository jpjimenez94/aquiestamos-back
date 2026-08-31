import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const MARCA = `borrar-${Date.now()}`
const CORREO = `admin.${MARCA}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * Borrar a una persona devuelve su solicitud a la cola.
 *
 * Sin esto, quien pidió ayuda desaparecía. La solicitud se quedaba en
 * EN_REVISION —el sistema la daba por atendida, así que no volvía a
 * Solicitudes— y la persona quedaba borrada —así que tampoco salía en «Por
 * asignar»—. Ni un error ni un aviso: simplemente dejaba de estar en las dos
 * únicas pantallas donde alguien la habría visto.
 *
 * Pasó de verdad, con una persona real, y se descubrió porque quien coordina
 * fue a buscarla y no estaba.
 */

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: CORREO,
      name: 'Admin borrado',
      passwordHash: await hashearClave(CLAVE),
      role: 'ADMIN',
      roles: ['ADMIN'],
      active: true,
      mustChangePassword: false,
    },
  })
  ids.usuario = usuario.id
})

beforeEach(async () => {
  const solicitud = await prisma.supportRequest.create({
    data: {
      name: `Persona ${MARCA}`,
      phone: '3001112233',
      city: 'Pereira',
      status: 'EN_REVISION',
      dataConsent: true,
      sensitiveDataConsent: true,
      consentVersion: '2026-09',
    },
  })

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Persona ${MARCA}`,
      phone: '3001112233',
      city: 'Pereira',
      status: 'EN_ADMISION',
      supportRequestId: solicitud.id,
    },
  })

  Object.assign(ids, { solicitud: solicitud.id, paciente: paciente.id })
})

afterAll(async () => {
  await prisma.caseAssignment.deleteMany({ where: { patient: { fullName: { contains: MARCA } } } })
  await prisma.patient.deleteMany({ where: { fullName: { contains: MARCA } } })
  await prisma.supportRequest.deleteMany({ where: { name: { contains: MARCA } } })
  await prisma.session.deleteMany({ where: { userId: ids.usuario } })
  await prisma.auditLog.deleteMany({ where: { actorEmail: CORREO } })
  await prisma.user.deleteMany({ where: { id: ids.usuario } })
})

async function borrar(idPaciente) {
  const login = await request(app).post('/api/auth/login').send({ email: CORREO, password: CLAVE })
  return request(app)
    .delete(`/api/patients/${idPaciente}`)
    .set('Authorization', `Bearer ${login.body.data.token}`)
}

async function admitir(idSolicitud) {
  const login = await request(app).post('/api/auth/login').send({ email: CORREO, password: CLAVE })
  return request(app)
    .post(`/api/patients/admitir/${idSolicitud}`)
    .set('Authorization', `Bearer ${login.body.data.token}`)
    .send({ priority: 'MEDIA' })
}

describe('al borrar a una persona', () => {
  /**
   * El caso completo, y el que de verdad se reportó: se borró, la solicitud
   * volvió a la cola, y al darle a «Admitir» la pantalla respondió «Ese
   * registro ya existe».
   *
   * `supportRequestId` es ÚNICO —una solicitud, una persona— y el registro
   * borrado seguía ocupando ese sitio. La solicitud se veía, se pulsaba, y no
   * pasaba nada: visible pero inservible, que es casi peor que no verla.
   */
  it('se puede volver a admitir, que es el punto de devolverla', async () => {
    await borrar(ids.paciente)

    const res = await admitir(ids.solicitud)
    expect(res.status, JSON.stringify(res.body)).toBe(201)

    const viva = await prisma.patient.findFirst({
      where: { supportRequestId: ids.solicitud, deletedAt: null },
    })
    expect(viva).not.toBeNull()
    expect(viva.id).not.toBe(ids.paciente)
  })

  /** Y el registro borrado sigue borrado: es el rastro de que aquello existió. */
  it('la persona borrada no resucita', async () => {
    await borrar(ids.paciente)
    await admitir(ids.solicitud)

    const vieja = await prisma.patient.findUnique({ where: { id: ids.paciente } })
    expect(vieja.deletedAt).not.toBeNull()
    expect(vieja.supportRequestId).toBeNull()
  })

  it('su solicitud vuelve a estar sobre la mesa', async () => {
    const res = await borrar(ids.paciente)
    expect(res.status).toBe(200)

    const solicitud = await prisma.supportRequest.findUnique({ where: { id: ids.solicitud } })
    expect(solicitud.status).toBe('NUEVO')
    expect(solicitud.deletedAt).toBeNull()
  })

  it('la persona sí queda borrada', async () => {
    await borrar(ids.paciente)
    const p = await prisma.patient.findUnique({ where: { id: ids.paciente } })
    expect(p.deletedAt).not.toBeNull()
  })

  /**
   * Si alguien ya descartó la solicitud a mano, borrar a la persona no la
   * resucita: descartar es una decisión y no se deshace por un efecto lateral.
   */
  it('una solicitud descartada no vuelve', async () => {
    await prisma.supportRequest.update({
      where: { id: ids.solicitud },
      data: { status: 'DESCARTADO' },
    })

    await borrar(ids.paciente)

    const solicitud = await prisma.supportRequest.findUnique({ where: { id: ids.solicitud } })
    expect(solicitud.status).toBe('DESCARTADO')
  })

  /** Y si la solicitud también estaba borrada, se quiso borrar todo. */
  it('una solicitud borrada no se rescata', async () => {
    await prisma.supportRequest.update({
      where: { id: ids.solicitud },
      data: { deletedAt: new Date() },
    })

    await borrar(ids.paciente)

    const solicitud = await prisma.supportRequest.findUnique({ where: { id: ids.solicitud } })
    expect(solicitud.status).toBe('EN_REVISION')
    expect(solicitud.deletedAt).not.toBeNull()
  })

  /**
   * El rastro lo dice: no es lo mismo borrar a alguien y dejar su solicitud
   * sobre la mesa que borrarlo del todo.
   */
  it('queda registrado si la solicitud volvió o no', async () => {
    await borrar(ids.paciente)

    const rastro = await prisma.auditLog.findFirst({
      where: { entityId: ids.paciente, action: 'borrar' },
      orderBy: { createdAt: 'desc' },
    })
    expect(rastro?.after).toMatchObject({ solicitudDevueltaALaCola: true })
  })
})
