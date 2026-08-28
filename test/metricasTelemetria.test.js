import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { hashearClave } from '../src/auth/password.js'

const app = createApp()
const marca = `telem-${Date.now()}`
const CORREO = `admin.${marca}@pruebas.local`
const CLAVE = 'PruebaLocal2026*'
const ids = {}

/**
 * Las métricas de telemetría de la pantalla de Métricas.
 *
 * El panel «Métricas técnicas en tiempo real» pintaba ceros y guiones desde
 * siempre. No era que faltaran datos: `telemetriaVirtual` no lo calculaba
 * nadie en el backend. La pantalla lo pedía, llegaba `undefined`, y como
 * estaba escrita para tolerar que faltara, toleró que no llegara nunca.
 *
 * Es de lo que no se descubre mirando. Unos ceros en una pantalla de métricas
 * se leen como «todavía no hay datos», no como «esto no está conectado» — y
 * este informe es el que sostiene lo que la red le cuenta a quien la financia.
 */

beforeAll(async () => {
  const usuario = await prisma.user.create({
    data: {
      email: CORREO,
      name: 'Admin telemetría',
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

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Persona ${marca}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      preferredModality: 'VIRTUAL',
    },
  })

  const hace = (h) => new Date(Date.now() - h * 3600000)
  const comun = { patientId: paciente.id, professionalId: profesional.id, modality: 'VIRTUAL' }

  // Tres sesiones pasadas: una con ambos, una solo con el profesional, una sin
  // nadie. Y una futura, que NO debe contar.
  await prisma.appointment.createMany({
    data: [
      {
        ...comun,
        startsAt: hace(3),
        endsAt: hace(2),
        status: 'REALIZADA',
        patientFirstJoinedAt: hace(3),
        professionalFirstJoinedAt: hace(3),
        totalCallDurationSeconds: 40 * 60,
      },
      {
        ...comun,
        startsAt: hace(5),
        endsAt: hace(4),
        status: 'NO_ASISTIO',
        professionalFirstJoinedAt: hace(5),
        totalCallDurationSeconds: 0,
      },
      { ...comun, startsAt: hace(9), endsAt: hace(8), status: 'NO_ASISTIO' },
      // Futura y sin nadie dentro: no cuenta. (Con `hace(-47)` de fin, el fin
      // caía ANTES del inicio y la base lo rechazó — buena restricción.)
      { ...comun, startsAt: hace(-48), endsAt: hace(-49), status: 'PROGRAMADA' },

      // Futura PERO con la llamada ya ocurrida. Este es el caso que se
      // reportó: se sostuvo la sesión antes de la hora agendada y el informe
      // decía cero sesiones virtuales.
      {
        ...comun,
        startsAt: hace(-72),
        endsAt: hace(-73),
        status: 'PROGRAMADA',
        patientFirstJoinedAt: hace(0.2),
        professionalFirstJoinedAt: hace(0.2),
        totalCallDurationSeconds: 40 * 60,
      },
    ],
  })

  Object.assign(ids, { usuario: usuario.id, profesional: profesional.id, paciente: paciente.id })
})

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { patientId: ids.paciente } })
  await prisma.patient.deleteMany({ where: { id: ids.paciente } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
  await prisma.session.deleteMany({ where: { userId: ids.usuario } })
  await prisma.auditLog.deleteMany({ where: { actorEmail: CORREO } })
  await prisma.user.deleteMany({ where: { id: ids.usuario } })
})

async function metricas() {
  const login = await request(app).post('/api/auth/login').send({ email: CORREO, password: CLAVE })
  const res = await request(app)
    .get('/api/dashboard/metricas')
    .set('Authorization', `Bearer ${login.body.data.token}`)
  return res
}

describe('la telemetría de las sesiones virtuales', () => {
  /**
   * Esta es la que habría cazado el fallo: el campo tiene que venir, no basta
   * con que la pantalla aguante su ausencia.
   */
  it('viene en la respuesta, no undefined', async () => {
    const res = await metricas()
    expect(res.status).toBe(200)
    expect(res.body.data.telemetriaVirtual).toBeDefined()
  })

  /**
   * Solo cuentan las que ya pasaron. Una cita de pasado mañana sin nadie
   * conectado no es una ausencia: es una cita que aún no ocurrió, y contarla
   * hundiría todas las tasas del informe.
   */
  it('no cuenta las sesiones que todavía no han ocurrido', async () => {
    const { telemetriaVirtual: t } = (await metricas()).body.data
    expect(t.totalSesionesVirtuales).toBeGreaterThanOrEqual(3)

    // De las tres pasadas: 2 con alguien, 1 con ambos.
    expect(t.sesionesConIngreso).toBeGreaterThanOrEqual(2)
    expect(t.sesionesCompletasConAmbos).toBeGreaterThanOrEqual(1)
  })

  it('las tasas son porcentajes, no cuentas', async () => {
    const { telemetriaVirtual: t } = (await metricas()).body.data
    for (const tasa of [t.tasaConexionAmbos, t.tasaIngresoPaciente, t.tasaIngresoProfesional]) {
      expect(tasa).toBeGreaterThanOrEqual(0)
      expect(tasa).toBeLessThanOrEqual(100)
    }
  })

  /**
   * El promedio sale solo de las sesiones que midieron algo. Meter los ceros
   * de aquellas donde la telemetría no llegó haría parecer cortas las que sí
   * se midieron — y ese número es el que dice cuánto dura de verdad un
   * acompañamiento.
   */
  it('el promedio de duración ignora las que no midieron nada', async () => {
    const { telemetriaVirtual: t } = (await metricas()).body.data
    expect(t.duracionPromedioMinutos).toBe(40)
  })

  /**
   * El caso reportado: «acabo de cerrar una sesión virtual y métricas dice 0».
   *
   * La cita estaba agendada para dentro de tres días, pero la llamada se
   * sostuvo hoy —se adelantaron, o se estaba probando el enlace—. El filtro
   * solo miraba la hora agendada, así que cuarenta minutos de sesión real no
   * aparecían por ningún lado.
   *
   * Si alguien abrió la sala, hubo sesión: lo dice la telemetría, no el
   * calendario.
   */
  it('una sesión sostenida antes de su hora agendada SÍ cuenta', async () => {
    const { telemetriaVirtual: t } = (await metricas()).body.data

    // Las tres pasadas más esta, que es futura pero tiene telemetría.
    expect(t.totalSesionesVirtuales).toBeGreaterThanOrEqual(4)
    expect(t.sesionesCompletasConAmbos).toBeGreaterThanOrEqual(2)
  })
})
