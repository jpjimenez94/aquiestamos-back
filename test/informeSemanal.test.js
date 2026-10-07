import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'
import { semanaDe, semanaPasada } from '../src/services/informeSemanal.service.js'

const app = createApp()
const marca = `informe-${Date.now()}`
const AGENDADOR = `agenda.${marca}@pruebas.local`
const LIDERES = `lideres.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * El informe semanal del área.
 *
 * Todas las semanas hay que entregar un documento con las cifras de la red, y
 * salían a mano: abrir cada pantalla, contar, apuntar. De ahí venían los
 * números con asterisco —«75 citas, se incluyen pruebas»— y las listas que
 * había que rastrear caso por caso.
 *
 * Lo que fijan estas pruebas es lo que no puede torcerse: que la semana sea de
 * lunes a domingo en hora de Bogotá —no en la del servidor, que corre en UTC y
 * movería el corte un día—, que lo de la semana no se mezcle con la foto de
 * hoy, y que las derivaciones a la red externa digan «no lo sabemos» en vez de
 * cero, porque nadie las registra todavía.
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
  const lideres = await crearUsuario(LIDERES, 'LIDERES_COMUNITARIOS')

  // Una persona a la que no se logra contactar: tiene que salir en la lista.
  const persona = await prisma.patient.create({
    data: {
      fullName: `Sin contacto ${marca}`,
      phone: '3000000000',
      city: 'Pereira',
      status: 'EN_ADMISION',
      priority: 'ALTA',
      preferredModality: 'VIRTUAL',
      availableDays: [],
      availableSlots: [],
      unreachableSince: new Date(Date.now() - 5 * 86400000),
      unreachableLastAt: new Date(Date.now() - 86400000),
      unreachableTries: 3,
      unreachableReason: 'NO_CONTESTA',
    },
  })

  Object.assign(ids, { agendador: agendador.id, lideres: lideres.id, persona: persona.id })
})

afterAll(async () => {
  if (ids.persona) await prisma.patient.deleteMany({ where: { id: ids.persona } })
  const usuarios = [ids.agendador, ids.lideres].filter(Boolean)
  await prisma.session.deleteMany({ where: { userId: { in: usuarios } } })
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } })
})

const pedir = async (query = '', quien = AGENDADOR) =>
  request(app)
    .get(`/api/dashboard/informe-semanal${query}`)
    .set('Authorization', `Bearer ${await token(quien)}`)

describe('la semana del informe', () => {
  /**
   * El servidor corre en UTC: a las 8 de la noche de Bogotá allí ya es el día
   * siguiente. Si la semana se calculara con el reloj del proceso, el corte
   * saldría movido un día y las cifras no cuadrarían con las pantallas.
   */
  it('va de lunes a domingo en hora de Bogotá', () => {
    // Un miércoles cualquiera, de noche en Bogotá (02:00 UTC del jueves).
    const { desde, hasta } = semanaDe(new Date('2026-09-24T02:00:00.000Z'))

    // Lunes 21 de septiembre, 00:00 en Bogotá = 05:00 UTC.
    expect(desde.toISOString()).toBe('2026-09-21T05:00:00.000Z')
    // Siete días exactos.
    expect(hasta.getTime() - desde.getTime()).toBe(7 * 24 * 3600 * 1000)
  })

  it('la de por defecto es la que acaba de cerrar, no la de ahora', () => {
    const ahora = new Date('2026-09-24T15:00:00.000Z') // jueves
    const pasada = semanaPasada(ahora)
    const actual = semanaDe(ahora)

    expect(pasada.hasta.getTime()).toBe(actual.desde.getTime())
  })
})

describe('las cifras del informe', () => {
  it('quien dirige el área puede pedirlo', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.body.data.periodo.desde).toBeTruthy()
  })

  it('separa lo de la semana de la foto de hoy', async () => {
    const { body } = await pedir()
    const d = body.data

    // De la semana: lo que entró entre lunes y domingo.
    expect(typeof d.atenciones.solicitudesRecibidas).toBe('number')
    expect(typeof d.casos.nuevosEnLaSemana).toBe('number')
    // De hoy: un saldo, no un movimiento.
    expect(typeof d.atenciones.enAcompanamiento).toBe('number')
    expect(typeof d.profesionales.activos).toBe('number')
  })

  /**
   * Nadie registra las derivaciones a la red externa. Decir «0» sería afirmar
   * que no hubo ninguna; lo cierto es que no lo sabemos.
   */
  it('las derivaciones a red externa van en null, no en cero', async () => {
    const { body } = await pedir()
    expect(body.data.casos.derivadosRedExterna).toBeNull()
  })

  it('trae las listas que hoy se buscan a mano', async () => {
    const { body } = await pedir()
    const mia = body.data.pendientes.noContestan.find((p) => p.id === ids.persona)

    expect(mia).toBeTruthy()
    expect(mia.prioridad).toBe('ALTA')
    expect(mia.intentos).toBe(3)
    expect(mia.diasSinContacto).toBeGreaterThanOrEqual(4)
    expect(Array.isArray(body.data.pendientes.sinElegirHora)).toBe(true)
    expect(Array.isArray(body.data.pendientes.sinProfesional)).toBe(true)
  })

  it('el voluntariado va por área, que es como lo pide el informe', async () => {
    const { body } = await pedir()
    expect(Array.isArray(body.data.voluntariado.porArea)).toBe(true)
    expect(typeof body.data.voluntariado.porcentajeActivos).toBe('number')
  })

  it('se puede pedir una semana concreta', async () => {
    const res = await pedir('?desde=2026-09-23')
    expect(res.status).toBe(200)
    expect(res.body.data.periodo.desde).toContain('2026-09-21')
  })

  it('una fecha inventada se rechaza', async () => {
    const res = await pedir('?desde=no-es-una-fecha')
    expect(res.status).toBe(400)
  })

  it('quien no es del área no lo ve', async () => {
    const res = await pedir('', LIDERES)
    expect(res.status).toBe(403)
  })

  /**
   * Las cifras se pueden abrir.
   *
   * «Me salen las cifras, pero quiero ver las citas puntuales que cuenta el
   * informe» —Sofi, 6 de octubre—. Un número que no se puede abrir no se puede
   * defender: quien firma tiene que poder contestar «¿cuáles seis?» y saber a
   * qué profesional preguntarle por cada una de las que faltan.
   */
  it('trae las citas de la semana una por una', async () => {
    const { body } = await pedir()
    expect(Array.isArray(body.data.citasDeLaSemana)).toBe(true)
    expect(body.data.citasDeLaSemana.length).toBe(body.data.atenciones.citasDeLaSemana)
  })

  /**
   * Y la lista no puede contradecir a la cifra.
   *
   * Son dos salidas del mismo recuento, y si alguien las calculara por
   * caminos distintos acabaríamos con una pantalla que dice seis y una lista
   * con cinco filas. Esto lo ata.
   */
  it('la lista y las cifras cuentan lo mismo', async () => {
    const { body } = await pedir()
    const d = body.data
    const cuantas = (que) => d.citasDeLaSemana.filter((c) => c.que === que).length

    expect(cuantas('SESION')).toBe(d.atenciones.citasRealizadasEnLaSemana)
    expect(cuantas('PENDIENTE')).toBe(d.atenciones.citasPendientesDeCerrar)
  })

  /** Y cada fila dice a quién llamar, que es para lo que sirve. */
  it('cada cita dice de quién es y quién la atendía', async () => {
    const { body } = await pedir()
    for (const c of body.data.citasDeLaSemana) {
      expect(c).toHaveProperty('cuando')
      expect(c).toHaveProperty('persona')
      expect(c).toHaveProperty('profesional')
      expect(c).toHaveProperty('personaId')
    }
  })
})
