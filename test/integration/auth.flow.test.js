import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { hashearClave } from '../../src/auth/password.js'

/**
 * Prueba de integración del portal: HTTP real contra la base real.
 *
 * Cubre lo que las pruebas unitarias no pueden: que las rutas estén conectadas
 * a los middlewares correctos y que un rol no alcance lo que no le toca.
 *
 * Necesita DATABASE_URL con las migraciones aplicadas.
 */

const app = createApp()
const sufijo = `test-${process.pid}`
const correo = (rol) => `${rol}.${sufijo}@pruebas.local`
const CLAVE = 'claveDePrueba2026'

async function crearUsuario(role) {
  return prisma.user.create({
    data: {
      email: correo(role.toLowerCase()),
      name: `Prueba ${role}`,
      role,
      passwordHash: await hashearClave(CLAVE),
      mustChangePassword: false,
    },
  })
}

async function entrar(role) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: correo(role.toLowerCase()), password: CLAVE })
  return res.body.data.token
}

let tokens = {}

beforeAll(async () => {
  for (const role of ['ADMIN', 'AGENDADOR', 'PROFESIONAL']) {
    await crearUsuario(role)
    tokens[role] = await entrar(role)
  }
}, 30000)

afterAll(async () => {
  const usuarios = await prisma.user.findMany({ where: { email: { endsWith: `${sufijo}@pruebas.local` } } })
  const ids = usuarios.map((u) => u.id)
  await prisma.session.deleteMany({ where: { userId: { in: ids } } })
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})

describe('sesión', () => {
  it('rechaza la petición sin token', async () => {
    const res = await request(app).get('/api/support-requests')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('rechaza un token inventado', async () => {
    const res = await request(app)
      .get('/api/support-requests')
      .set('Authorization', 'Bearer no-existe')
    expect(res.status).toBe(401)
  })

  it('rechaza la clave incorrecta sin decir si el correo existe', async () => {
    const conCuenta = await request(app)
      .post('/api/auth/login')
      .send({ email: correo('admin'), password: 'incorrecta123' })
    const sinCuenta = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@pruebas.local', password: 'incorrecta123' })

    expect(conCuenta.status).toBe(401)
    expect(sinCuenta.status).toBe(401)
    expect(conCuenta.body.message).toBe(sinCuenta.body.message)
  })

  it('devuelve el perfil y los permisos del rol', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokens.AGENDADOR}`)
    expect(res.status).toBe(200)
    expect(res.body.data.role).toBe('AGENDADOR')
    expect(res.body.data.permisos).toContain('cita:crear')
    expect(res.body.data.permisos).not.toContain('*')
  })

  it('nunca expone el hash de la clave', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokens.ADMIN}`)
    expect(JSON.stringify(res.body)).not.toContain('argon2')
    expect(res.body.data.passwordHash).toBeUndefined()
  })

  it('cerrar sesión invalida el token', async () => {
    const token = await entrar('PROFESIONAL')
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200)

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)

    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401)
  })
})

describe('permisos por rol', () => {
  const matriz = [
    ['ADMIN', 'get', '/api/support-requests', 200],
    ['ADMIN', 'get', '/api/users', 200],
    ['ADMIN', 'get', '/api/audit', 200],

    ['AGENDADOR', 'get', '/api/support-requests', 200],
    ['AGENDADOR', 'get', '/api/volunteers', 200],
    ['AGENDADOR', 'get', '/api/users', 403],
    ['AGENDADOR', 'get', '/api/audit', 403],

    ['PROFESIONAL', 'get', '/api/support-requests', 403],
    ['PROFESIONAL', 'get', '/api/volunteers', 403],
    ['PROFESIONAL', 'get', '/api/users', 403],
    ['PROFESIONAL', 'get', '/api/audit', 403],
  ]

  for (const [rol, metodo, ruta, esperado] of matriz) {
    it(`${rol} ${metodo.toUpperCase()} ${ruta} -> ${esperado}`, async () => {
      const res = await request(app)[metodo](ruta).set('Authorization', `Bearer ${tokens[rol]}`)
      expect(res.status).toBe(esperado)
    })
  }

  it('el agendador no puede crear cuentas', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.AGENDADOR}`)
      .send({ email: 'colado@pruebas.local', name: 'Colado', role: 'ADMIN', password: 'claveValida2026' })
    expect(res.status).toBe(403)

    const creado = await prisma.user.findUnique({ where: { email: 'colado@pruebas.local' } })
    expect(creado).toBeNull()
  })
})

describe('rutas públicas', () => {
  it('la biblioteca sigue siendo pública', async () => {
    expect((await request(app).get('/api/resources')).status).toBe(200)
  })

  it('el formulario público sigue aceptando envíos sin sesión', async () => {
    const res = await request(app).post('/api/support-requests').send({
      forWhom: 'PARA_MI',
      name: `Prueba ${sufijo}`,
      phone: '3001234567',
      email: `solicitante.${sufijo}@pruebas.local`,
      preferredContact: 'WHATSAPP',
      city: 'Bogotá',
      preferredModality: 'VIRTUAL',
      availableDays: ['JUEVES'],
      availableSlots: ['TARDE'],
      consentVersion: '2026-08',
      dataConsent: true,
      sensitiveDataConsent: true,
    })
    expect(res.status).toBe(201)

    await prisma.supportRequest.deleteMany({ where: { email: `solicitante.${sufijo}@pruebas.local` } })
  })

  it('el formulario público rechaza datos inválidos', async () => {
    const res = await request(app).post('/api/support-requests').send({ name: '' })
    expect(res.status).toBe(422)
    expect(res.body.details).toBeTruthy()
  })
})

describe('minimización de datos', () => {
  it('el agendador no ve el texto libre que escribió la persona', async () => {
    const creada = await prisma.supportRequest.create({
      data: {
        forWhom: 'PARA_MI',
        name: `Confidencial ${sufijo}`,
        phone: '3001112233',
        preferredContact: 'WHATSAPP',
        city: 'Bogotá',
        preferredModality: 'VIRTUAL',
        availableDays: ['LUNES'],
        availableSlots: ['MANANA'],
        message: 'ESTO-NO-DEBE-VERLO-EL-AGENDADOR',
        consentVersion: '2026-08',
        dataConsent: true,
        sensitiveDataConsent: true,
      },
    })

    const comoAgendador = await request(app)
      .get('/api/support-requests')
      .set('Authorization', `Bearer ${tokens.AGENDADOR}`)
    expect(JSON.stringify(comoAgendador.body)).not.toContain('ESTO-NO-DEBE-VERLO-EL-AGENDADOR')

    const comoAdmin = await request(app)
      .get('/api/support-requests')
      .set('Authorization', `Bearer ${tokens.ADMIN}`)
    expect(JSON.stringify(comoAdmin.body)).toContain('ESTO-NO-DEBE-VERLO-EL-AGENDADOR')

    await prisma.supportRequest.delete({ where: { id: creada.id } })
  })
})

describe('auditoría', () => {
  it('deja rastro de quién consulta datos sensibles', async () => {
    await request(app).get('/api/support-requests').set('Authorization', `Bearer ${tokens.ADMIN}`)

    const entradas = await prisma.auditLog.findMany({
      where: { actorEmail: correo('admin'), action: 'consultar', entity: 'solicitud' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    expect(entradas.length).toBe(1)
    expect(entradas[0].actorEmail).toBe(correo('admin'))
  })

  it('registra los intentos de acceso fallidos', async () => {
    await request(app).post('/api/auth/login').send({ email: correo('admin'), password: 'malaclave123' })

    const fallos = await prisma.auditLog.findMany({
      where: { action: 'acceso_fallido', entity: 'usuario' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    expect(fallos.length).toBe(1)
  })
})
