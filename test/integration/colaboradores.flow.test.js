import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { hashearClave } from '../../src/auth/password.js'

/**
 * El recorrido del voluntariado de apoyo: alguien se registra por el
 * formulario público y aparece en el directorio del portal.
 *
 * Lo que se fija aquí, además del camino feliz:
 *   · el directorio no es público — sin sesión no se ve;
 *   · un profesional de la red tampoco lo ve: no es asunto suyo;
 *   · los filtros por área, ciudad y modalidad devuelven lo que deben.
 */

const app = createApp()
const marca = `colab-${process.pid}`
const CLAVE = 'claveDePrueba2026'

const tokens = {}

function persona(sufijo, extra = {}) {
  return {
    fullName: `Persona ${sufijo}`,
    phone: '3145558899',
    email: `${sufijo}.${marca}@ejemplo.com`,
    city: 'Ibagué',
    area: 'OPERACION_LOGISTICA',
    discipline: 'Logística',
    modality: 'VIRTUAL',
    availableDays: ['LUNES'],
    availableSlots: ['TARDE'],
    weeklyHours: 'ENTRE_4_Y_6',
    consentVersion: '2026-08',
    dataConsent: true,
    ...extra,
  }
}

beforeAll(async () => {
  const hash = await hashearClave(CLAVE)
  const cuentas = [
    { email: `admin.${marca}@ejemplo.com`, name: 'Admin', role: 'ADMIN' },
    { email: `agenda.${marca}@ejemplo.com`, name: 'Agenda', role: 'AGENDADOR' },
    { email: `pro.${marca}@ejemplo.com`, name: 'Pro', role: 'PROFESIONAL' },
    { email: `lectura.${marca}@ejemplo.com`, name: 'Lectura', role: 'LECTURA' },
  ]

  for (const cuenta of cuentas) {
    await prisma.user.create({
      data: { ...cuenta, passwordHash: hash, mustChangePassword: false },
    })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: cuenta.email, password: CLAVE })
    tokens[cuenta.role] = res.body.data.token
  }
})

afterAll(async () => {
  await prisma.collaborator.deleteMany({ where: { email: { contains: marca } } })
  await prisma.session.deleteMany({ where: { user: { email: { contains: marca } } } })
  await prisma.auditLog.deleteMany({ where: { actorEmail: { contains: marca } } })
  await prisma.user.deleteMany({ where: { email: { contains: marca } } })
  await prisma.$disconnect()
})

describe('voluntariado de apoyo', () => {
  it('cualquiera puede registrarse sin sesión', async () => {
    const res = await request(app).post('/api/collaborators').send(persona('logistica'))

    expect(res.status).toBe(201)
    // El acuse devuelve lo mínimo: ni el correo ni el teléfono vuelven.
    expect(Object.keys(res.body.data).sort()).toEqual(['createdAt', 'fullName', 'id'])
  })

  it('no entra en el circuito de acompañamiento psicológico', async () => {
    // La comprobación que de verdad importa: registrarse aquí no crea una
    // postulación ni un profesional al que se le puedan asignar pacientes.
    const postulaciones = await prisma.volunteer.count({
      where: { email: { contains: marca } },
    })
    const profesionales = await prisma.professional.count({
      where: { email: { contains: marca } },
    })

    expect(postulaciones).toBe(0)
    expect(profesionales).toBe(0)
  })

  it('el directorio no es público', async () => {
    const res = await request(app).get('/api/collaborators')
    expect(res.status).toBe(401)
  })

  it('un profesional de la red no ve el directorio', async () => {
    const res = await request(app)
      .get('/api/collaborators')
      .set('Authorization', `Bearer ${tokens.PROFESIONAL}`)
    expect(res.status).toBe(403)
  })

  it('el agendador tampoco lo ve: decisión expresa de la red', async () => {
    const res = await request(app)
      .get('/api/collaborators')
      .set('Authorization', `Bearer ${tokens.AGENDADOR}`)
    expect(res.status).toBe(403)
  })

  it('la administración sí lo ve, con el resumen por área', async () => {
    const res = await request(app)
      .get('/api/collaborators')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)

    expect(res.status).toBe(200)
    expect(res.body.meta.porArea.length).toBeGreaterThan(0)

    const mia = res.body.data.find((c) => c.email.includes(marca))
    expect(mia.discipline).toBe('Logística')
    expect(mia.areaLegible).toBe('Operacion y logistica')
  })

  it('filtra por área, por ciudad y por quién puede ir presencial', async () => {
    await request(app)
      .post('/api/collaborators')
      .send(
        persona('medica', {
          area: 'SALUD',
          discipline: 'Medicina',
          city: 'Cali',
          modality: 'PRESENCIAL',
          yellowFeverVaccine: 'SI',
          sensitiveDataConsent: true,
        }),
      )

    const mios = (respuesta) => respuesta.body.data.filter((c) => c.email.includes(marca))
    const pedir = (query) =>
      request(app)
        .get(`/api/collaborators?${query}`)
        .set('Authorization', `Bearer ${tokens.ADMIN}`)

    expect(mios(await pedir('area=SALUD'))).toHaveLength(1)
    expect(mios(await pedir('area=OPERACION_LOGISTICA'))).toHaveLength(1)
    // La ciudad busca por trozo y sin distinguir mayúsculas.
    expect(mios(await pedir('city=ibagu'))).toHaveLength(1)
    // Quien puede ir presencial: no debe salir quien solo apoya en remoto.
    expect(mios(await pedir('modality=PRESENCIAL'))).toHaveLength(1)
  })

  it('el rol de lectura ve el directorio pero no puede escribir nada', async () => {
    const lee = await request(app)
      .get('/api/collaborators')
      .set('Authorization', `Bearer ${tokens.LECTURA}`)
    expect(lee.status).toBe(200)

    // Ninguna escritura pasa: ni admitir, ni aprobar, ni crear cuentas.
    const admitir = await request(app)
      .post('/api/patients/admitir/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${tokens.LECTURA}`)
      .send({ priority: 'ALTA' })
    expect(admitir.status).toBe(403)

    const aprobar = await request(app)
      .post('/api/professionals/aprobar/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${tokens.LECTURA}`)
      .send({})
    expect(aprobar.status).toBe(403)

    const crearCuenta = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.LECTURA}`)
      .send({ email: 'x@x.com', name: 'X', role: 'ADMIN', password: 'unaClaveLarga123' })
    expect(crearCuenta.status).toBe(403)
  })

  it('deja rastro en auditoría de quién consulta el directorio', async () => {
    await request(app)
      .get('/api/collaborators')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)

    const consultas = await prisma.auditLog.count({
      where: {
        entity: 'colaborador',
        action: 'consultar',
        actorEmail: { contains: marca },
      },
    })
    expect(consultas).toBeGreaterThan(0)
  })
})
