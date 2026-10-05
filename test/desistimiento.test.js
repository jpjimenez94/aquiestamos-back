import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { crearEnlaceDesistimiento } from '../src/auth/enlaceDesistimiento.js'
import { SettingsService } from '../src/services/settings.service.js'

const app = createApp()
const marca = `desist-${Date.now()}`
const ids = {}

/**
 * La constancia de quien decide no tomar el acompañamiento.
 *
 * Cerrar un caso «porque no quiso» era nuestra palabra sobre la decisión de
 * otra persona: coordinación escribía un motivo y listo. Con esto lo dice ella,
 * desde su enlace, y queda registrado qué texto leyó al decirlo.
 *
 * Lo que fijan estas pruebas es lo que da valor a ese documento y no puede
 * torcerse: que se guarde el texto ÍNTEGRO —no su versión, el texto— para que
 * cambiarlo mañana no altere lo que alguien aceptó ayer; que el caso quede
 * cerrado de verdad; que firmar dos veces no rompa nada; y que un enlace de
 * otra puerta no sirva aquí.
 */
beforeAll(async () => {
  const persona = await prisma.patient.create({
    data: {
      fullName: `Quien Desiste ${marca}`,
      phone: '3000000000',
      city: 'Pereira',
      status: 'EN_ADMISION',
      priority: 'MEDIA',
      preferredModality: 'VIRTUAL',
      availableDays: [],
      availableSlots: [],
    },
  })
  ids.persona = persona.id
  ids.token = crearEnlaceDesistimiento(persona.id)
})

afterAll(async () => {
  if (!ids.persona) return
  await prisma.notification.deleteMany({ where: { entityId: ids.persona } })
  await prisma.auditLog.deleteMany({ where: { entityId: ids.persona } })
  await prisma.caseWithdrawal.deleteMany({ where: { patientId: ids.persona } })
  await prisma.patient.deleteMany({ where: { id: ids.persona } })
})

describe('la constancia de desistimiento', () => {
  it('el enlace enseña el texto vigente y su versión', async () => {
    const res = await request(app).get(`/api/desistimiento/${ids.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.texto.length).toBeGreaterThan(50)
    expect(res.body.data.version).toBeTruthy()
    expect(res.body.data.yaCerrado).toBe(false)
    expect(res.body.data.constancia).toBeNull()
  })

  /** El texto habla de las líneas de crisis: eso no se negocia. */
  it('el texto le recuerda que las líneas de emergencia siguen ahí', async () => {
    const res = await request(app).get(`/api/desistimiento/${ids.token}`)
    expect(res.body.data.texto).toContain('123')
    expect(res.body.data.texto.toLowerCase()).toContain('puedes volver a solicitar')
  })

  it('sin nombre no se firma nada', async () => {
    const res = await request(app).post(`/api/desistimiento/${ids.token}`).send({ nombre: 'a' })
    expect(res.status).toBe(422)
  })

  it('al aceptar, el caso queda cerrado', async () => {
    const res = await request(app)
      .post(`/api/desistimiento/${ids.token}`)
      .send({ nombre: 'Quien Desiste De Verdad', motivo: 'Ya estoy mejor, gracias.' })

    expect(res.status).toBe(200)
    expect(res.body.data.yaCerrado).toBe(true)

    const persona = await prisma.patient.findUnique({ where: { id: ids.persona } })
    expect(persona.status).toBe('CERRADO')
  })

  /**
   * Lo que da valor a la constancia: si legal cambia el texto mañana, lo que
   * esta persona aceptó tiene que seguir diciendo lo que decía.
   */
  it('guarda el texto entero, no solo su versión', async () => {
    const constancia = await prisma.caseWithdrawal.findFirst({ where: { patientId: ids.persona } })
    const vigente = await SettingsService.getValue('DESISTIMIENTO_TEXTO', '')

    expect(constancia.textSnapshot).toBe(vigente)
    expect(constancia.textSnapshot.length).toBeGreaterThan(50)
    expect(constancia.signedName).toBe('Quien Desiste De Verdad')
    expect(constancia.reason).toContain('mejor')
    expect(constancia.textVersion).toBeTruthy()
  })

  it('queda en la auditoría, a nombre de ella', async () => {
    const rastro = await prisma.auditLog.findFirst({
      where: { entity: 'paciente', entityId: ids.persona },
      orderBy: { createdAt: 'desc' },
    })
    expect(rastro).toBeTruthy()
    expect(JSON.stringify(rastro.after)).toContain('desistimiento')
    expect(rastro.actorEmail).toContain('paciente:')
  })

  it('abrir el enlace otra vez enseña la constancia, no el formulario', async () => {
    const res = await request(app).get(`/api/desistimiento/${ids.token}`)
    expect(res.body.data.yaCerrado).toBe(true)
    expect(res.body.data.constancia.nombre).toBe('Quien Desiste De Verdad')
  })

  it('firmar dos veces no cierra nada dos veces ni falla', async () => {
    const res = await request(app)
      .post(`/api/desistimiento/${ids.token}`)
      .send({ nombre: 'Quien Desiste De Verdad' })

    expect(res.status).toBe(200)
    const cuantas = await prisma.caseWithdrawal.count({ where: { patientId: ids.persona } })
    expect(cuantas).toBe(1)
  })

  /**
   * Lo que distingue este cierre de todos los demás.
   *
   * Los otros los hace alguien del equipo delante de la pantalla, que puede
   * escribirle al profesional. Este lo firma ella desde su teléfono un domingo
   * por la noche: si nadie manda el aviso, al profesional se le cancelan las
   * sesiones de la agenda sin una palabra. Es el mismo agujero que ya tuvimos
   * con reasignar y cancelar.
   */
  it('coordinación se entera por correo', async () => {
    const aviso = await prisma.notification.findFirst({
      where: { template: 'COORD_DESISTIMIENTO', entityId: ids.persona },
    })
    expect(aviso).toBeTruthy()
  })

  /** Y el correo no lleva su nombre: lleva el enlace, como todos. */
  it('el aviso no reparte el nombre de la persona', async () => {
    const aviso = await prisma.notification.findFirst({
      where: { template: 'COORD_DESISTIMIENTO', entityId: ids.persona },
    })
    const todo = `${aviso.subject} ${JSON.stringify(aviso.payload)}`
    expect(todo).not.toContain('Quien Desiste')
    expect(todo).not.toContain('3000000000')
  })

  it('un token de otra puerta no abre esta', async () => {
    const res = await request(app).get('/api/desistimiento/noesuntokenvalido')
    expect(res.status).toBe(404)
  })
})
