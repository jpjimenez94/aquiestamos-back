import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `camino-${Date.now()}`
const CORREO = `admin.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * El embudo «El camino de quien pide ayuda», del informe.
 *
 * Su último peldaño —«Tuvieron su sesión»— contaba citas en estado REALIZADA.
 * Pero REALIZADA no lo pone el sistema: lo pone una persona pulsando «Marcar
 * como Realizada» en el portal. El informe salía diciendo «0 · 0%» mientras
 * la pestaña de al lado enseñaba doce sesiones virtuales con telemetría, y la
 * tarjeta de asistencia, tres centímetros más abajo, decía 100%.
 *
 * Cero es el peor número que puede dar mal: no se lee como «esta medida está
 * rota», se lee como «esto no está funcionando». Y este es el informe con el
 * que la red le cuenta a quien la financia lo que hace.
 */

const hace = (h) => new Date(Date.now() - h * 3600000)

async function crearCaso({ nombre, borrada = false, cita, reporta = null }) {
  const solicitud = await prisma.supportRequest.create({
    data: { name: nombre, phone: '3000000000', dataConsent: true, createdAt: hace(72) },
  })
  const persona = await prisma.patient.create({
    data: {
      fullName: nombre,
      phone: '3000000001',
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      preferredModality: 'VIRTUAL',
      supportRequestId: solicitud.id,
      ...(borrada ? { deletedAt: new Date() } : {}),
    },
  })
  const asignacion = await prisma.caseAssignment.create({
    data: { patientId: persona.id, professionalId: ids.profesional, status: 'ACTIVA' },
  })
  const creada = await prisma.appointment.create({
    data: {
      patientId: persona.id,
      professionalId: ids.profesional,
      caseAssignmentId: asignacion.id,
      modality: 'VIRTUAL',
      ...cita,
    },
  })
  if (reporta) {
    await prisma.caseReport.create({
      data: {
        assignmentId: asignacion.id,
        outcome: reporta,
        reportedByEmail: `prof.${marca}@pruebas.local`,
        // Después de la sesión: es el reporte que la cierra.
        createdAt: new Date(new Date(cita.startsAt).getTime() + 3600000),
      },
    })
  }
  return { solicitud, persona, asignacion, cita: creada }
}

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: CORREO,
      name: 'Admin camino',
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
  Object.assign(ids, { usuario: usuario.id, profesional: profesional.id })

  // 1 · Ocurrió de verdad: las dos personas entraron. Nadie marcó la casilla.
  const conPrueba = await crearCaso({
    nombre: `Con prueba ${marca}`,
    cita: {
      startsAt: hace(3),
      endsAt: hace(2),
      status: 'CONFIRMADA',
      patientFirstJoinedAt: hace(3),
      professionalFirstJoinedAt: hace(3),
    },
  })

  // 2 · Pasó la hora y no hay ni casilla ni rastro: no se sabe.
  const sinCerrar = await crearCaso({
    nombre: `Sin cerrar ${marca}`,
    cita: { startsAt: hace(5), endsAt: hace(4), status: 'CONFIRMADA' },
  })

  // 3 · Persona borrada. No debe aparecer por ningún lado.
  const borrada = await crearCaso({
    nombre: `Borrada ${marca}`,
    borrada: true,
    cita: {
      startsAt: hace(6),
      endsAt: hace(5),
      status: 'REALIZADA',
      patientFirstJoinedAt: hace(6),
      professionalFirstJoinedAt: hace(6),
    },
  })

  /**
    * 4 · Nadie marcó nada y nadie llegó a abrir la sala —o la pestaña se
    * cerró—, pero el profesional reportó «ya la acompañé». Esta es la que
    * el informe perdía entera: sin casilla y sin rastro, no existía.
    */
  const reportada = await crearCaso({
    nombre: `Reportada ${marca}`,
    cita: { startsAt: hace(8), endsAt: hace(7), status: 'CONFIRMADA' },
    reporta: 'YA_ATENDIDA',
  })

  Object.assign(ids, { conPrueba, sinCerrar, borrada, reportada })
})

afterAll(async () => {
  const casos = [ids.conPrueba, ids.sinCerrar, ids.borrada, ids.reportada]
  const personas = casos.map((c) => c.persona.id)
  const solicitudes = casos.map((c) => c.solicitud.id)
  const asignaciones = casos.map((c) => c.asignacion.id)
  await prisma.caseReport.deleteMany({ where: { assignmentId: { in: asignaciones } } })
  await prisma.appointment.deleteMany({ where: { patientId: { in: personas } } })
  await prisma.caseAssignment.deleteMany({ where: { id: { in: asignaciones } } })
  await prisma.patient.deleteMany({ where: { id: { in: personas } } })
  await prisma.supportRequest.deleteMany({ where: { id: { in: solicitudes } } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
  await prisma.session.deleteMany({ where: { userId: ids.usuario } })
  await prisma.auditLog.deleteMany({ where: { actorEmail: CORREO } })
  await prisma.user.deleteMany({ where: { id: ids.usuario } })
})

async function conSesionIniciada(ruta) {
  const login = await request(app).post('/api/auth/login').send({ email: CORREO, password: CLAVE })
  return request(app).get(ruta).set('Authorization', `Bearer ${login.body.data.token}`)
}

const peldano = (camino, etapa) => camino.find((p) => p.etapa === etapa)

describe('el último peldaño del camino', () => {
  /**
   * La que habría cazado el fallo. Una sesión con las dos personas dentro de
   * la sala ocurrió, la marque alguien o no: para abrir esa puerta hace falta
   * el enlace firmado de cada rol, y nadie la abre por accidente.
   */
  it('cuenta una sesión con los dos dentro aunque nadie marcara la casilla', async () => {
    const res = await conSesionIniciada('/api/dashboard/metricas')
    expect(res.status).toBe(200)
    expect(peldano(res.body.data.camino, 'Tuvieron su sesión').cuantas).toBeGreaterThan(0)
  })

  /**
   * Y no cuenta de más: una cita cuya hora pasó sin rastro de nadie no se
   * convierte en sesión por haber pasado. Eso es deuda de cierre, y va aparte.
   */
  it('lo que pasó sin rastro no se cuenta como sesión: se cuenta como cierre pendiente', async () => {
    const res = await conSesionIniciada('/api/dashboard/metricas')
    expect(res.body.data.esperandoCierre).toBeGreaterThan(0)
  })
})

describe('lo que reporta el profesional', () => {
  /**
   * La telemetría depende de que la pestaña de la sala siguiera abierta: si
   * alguien la cerró, si se fue la señal, si entraron desde el móvil y la app
   * pasó a segundo plano, el rastro no llega. Quien sí sabe qué pasó es el
   * profesional, y lo escribe al cerrar el caso.
   *
   * Sin esto, una sesión sin casilla y sin rastro no existía para el informe.
   */
  it('«ya la acompañé» cuenta como sesión, sin casilla y sin rastro de sala', async () => {
    const res = await conSesionIniciada('/api/dashboard/metricas')
    expect(res.status).toBe(200)
    // Dos personas tuvieron sesión: la del rastro y la que el profesional reportó.
    expect(peldano(res.body.data.camino, 'Tuvieron su sesión').cuantas).toBeGreaterThanOrEqual(2)
  })

  it('y esa cita deja de contar como cierre pendiente', async () => {
    const res = await conSesionIniciada('/api/dashboard/metricas')
    // Solo queda pendiente la que pasó sin reporte, sin casilla y sin rastro.
    expect(res.body.data.esperandoCierre).toBeGreaterThan(0)
  })
})

describe('las personas borradas', () => {
  it('no cuentan en el camino, ni siquiera con la sesión marcada', async () => {
    const res = await conSesionIniciada('/api/dashboard/metricas')
    const admitidas = peldano(res.body.data.camino, 'Fueron admitidas').cuantas
    const nombres = JSON.stringify(res.body.data.camino)
    expect(nombres).not.toContain('Borrada')
    expect(admitidas).toBeGreaterThan(0)
  })

  /**
   * Y sus citas tampoco son agenda. Se quedaban pintadas en el calendario
   * semanal —«prueba / Prueba» entre las personas reales— sin forma de
   * quitarlas desde ninguna pantalla.
   */
  it('sus citas desaparecen del calendario de la semana', async () => {
    const desde = hace(24).toISOString()
    const hasta = hace(-24).toISOString()
    const res = await conSesionIniciada(`/api/appointments?desde=${desde}&hasta=${hasta}`)
    expect(res.status).toBe(200)
    const nombres = res.body.data.map((c) => c.paciente?.nombre ?? '')
    expect(nombres.some((n) => n.startsWith('Borrada'))).toBe(false)
    expect(nombres.some((n) => n.startsWith('Con prueba'))).toBe(true)
  })
})
