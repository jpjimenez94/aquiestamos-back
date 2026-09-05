import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { hashearClave } from '../../src/auth/password.js'
import { crearEnlaceCuidado } from '../../src/auth/enlaceCuidado.js'

const app = createApp()
const MARCA = `cuidado-${Date.now()}`
const CLAVE = 'PruebaLocal2026*'
const hace = (h) => new Date(Date.now() - h * 3600000)

/**
 * CUIDADO DEL EQUIPO, de punta a punta.
 *
 * Quien acompaña también se carga. Lo que se prueba aquí es el camino
 * completo y sus dos puertas: la del profesional —su propio enlace firmado,
 * que apunta a él y no a ninguno de sus casos— y la de coordinación —con
 * sesión y permiso—.
 *
 *   1. Antes del umbral no se abre el espacio, y la puerta lo vuelve a
 *      comprobar aunque la pantalla no enseñe el botón.
 *   2. A partir del umbral, el check-in entra con la carga con la que llegó.
 *   3. Supervisor lo marca coordinación desde la ficha: al profesional no
 *      se le pregunta desde su enlace —quién puede facilitar se sabe por el
 *      formulario de voluntarios—.
 *   4. Coordinación convoca: la agenda se arma sola con las preguntas, los
 *      check-ins quedan apuntando a la sesión, y a todos les sale el correo.
 *   5. Un rol de solo lectura ve y no toca.
 *
 * Nada de esto toca citas, asignaciones ni reportes: se leen para contar.
 */

const ids = {}
let tokenCaso
let tokenCuidado
let tokenAdmin
let tokenLectura

async function crearUsuario(rol, sufijo) {
  return prisma.user.create({
    data: {
      email: `${sufijo}.${MARCA}@pruebas.local`,
      name: `${rol} ${MARCA}`,
      passwordHash: await hashearClave(CLAVE),
      role: rol,
      roles: [rol],
      active: true,
      mustChangePassword: false,
    },
  })
}

async function crearProfesional(sufijo, extra = {}) {
  return prisma.professional.create({
    data: {
      fullName: `Profesional ${sufijo} ${MARCA}`,
      email: `prof.${sufijo}.${MARCA}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
      professionalCardVerified: true,
      maxActiveCases: 5,
      ...extra,
    },
  })
}

async function login(email) {
  const r = await request(app).post('/api/auth/login').send({ email, password: CLAVE })
  return r.body.data.token
}

/** Una sesión que ocurrió: REALIZADA basta para `huboSesion`. */
async function sesionHecha(professionalId, patientId, caseAssignmentId, hace_h) {
  return prisma.appointment.create({
    data: {
      professionalId,
      patientId,
      caseAssignmentId,
      startsAt: hace(hace_h),
      endsAt: hace(hace_h - 0.75),
      status: 'REALIZADA',
      modality: 'VIRTUAL',
      consentSigned: true,
    },
  })
}

beforeAll(async () => {
  const admin = await crearUsuario('ADMIN', 'admin')
  const lectura = await crearUsuario('LECTURA', 'lectura')
  ids.usuarios = [admin.id, lectura.id]

  // Quien acompaña, y quien se va a ofrecer a facilitar.
  const acompana = await crearProfesional('acompana')
  const facilita = await crearProfesional('facilita')
  const persona = await prisma.patient.create({
    data: {
      fullName: `Persona ${MARCA}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      priority: 'MEDIA',
      preferredModality: 'VIRTUAL',
    },
  })
  const asignacion = await prisma.caseAssignment.create({
    data: {
      patientId: persona.id,
      professionalId: acompana.id,
      status: 'ACTIVA',
      startedAt: new Date(),
      respondedAt: new Date(),
    },
  })
  Object.assign(ids, {
    acompana: acompana.id,
    facilita: facilita.id,
    persona: persona.id,
    asignacion: asignacion.id,
    correoAcompana: acompana.email,
  })

  // Dos sesiones hechas: una menos que el umbral por defecto (3).
  await sesionHecha(acompana.id, persona.id, asignacion.id, 240)
  await sesionHecha(acompana.id, persona.id, asignacion.id, 120)

  const auth = await request(app).post(`/api/shared-cases/${persona.id}/auth`).send({ email: acompana.email })
  tokenCaso = auth.body.data.token
  tokenCuidado = crearEnlaceCuidado(acompana.id)
  tokenAdmin = await login(admin.email)
  tokenLectura = await login(lectura.email)
})

afterAll(async () => {
  await prisma.supportGroupInvitation.deleteMany({ where: { professionalId: { in: [ids.acompana, ids.facilita] } } })
  await prisma.professionalCheckIn.deleteMany({ where: { professionalId: { in: [ids.acompana, ids.facilita] } } })
  await prisma.supportGroupSession.deleteMany({ where: { facilitatorId: ids.facilita } })
  await prisma.notification.deleteMany({ where: { toEmail: { contains: MARCA } } })
  await prisma.appointment.deleteMany({ where: { patientId: ids.persona } })
  await prisma.caseAssignment.deleteMany({ where: { id: ids.asignacion } })
  await prisma.patient.deleteMany({ where: { id: ids.persona } })
  await prisma.professional.deleteMany({ where: { id: { in: [ids.acompana, ids.facilita] } } })
  await prisma.session.deleteMany({ where: { userId: { in: ids.usuarios } } })
  await prisma.auditLog.deleteMany({ where: { actorEmail: { contains: MARCA } } })
  await prisma.user.deleteMany({ where: { id: { in: ids.usuarios } } })
})

/** Su propio enlace: apunta al profesional, no a un caso. */
const suEnlace = (metodo, ruta = '') =>
  request(app)[metodo](`/api/cuidado-profesional/${tokenCuidado}${ruta}`)

describe('desde su propio enlace', () => {
  it('un enlace inventado no abre nada', async () => {
    expect((await request(app).get('/api/cuidado-profesional/esto-no-es-un-token')).status).toBe(404)
  })

  /**
   * La puerta que existió un día y se cerró: el espacio salió del enlace del
   * caso. Colgado de ahí ataba el espacio de quien acompaña a una persona
   * acompañada, y mezclaba dos conversaciones en la misma pantalla.
   */
  it('ya no cuelga del enlace del caso', async () => {
    const ver = await request(app)
      .get(`/api/shared-cases/${ids.persona}/cuidado`)
      .set('x-shared-case-token', tokenCaso)
    expect(ver.status).toBe(404)
    const pedir = await request(app)
      .post(`/api/shared-cases/${ids.persona}/cuidado/check-in`)
      .set('x-shared-case-token', tokenCaso)
      .send({ need: 'DESCARGARME' })
    expect(pedir.status).toBe(404)
  })

  it('cuenta sus sesiones y dice desde cuándo se abre el espacio', async () => {
    const r = await suEnlace('get')
    expect(r.status).toBe(200)
    expect(r.body.data.sesiones).toBe(2)
    expect(r.body.data.umbral).toBe(3)
    expect(r.body.data.habilitado).toBe(false)
    // Y no dice nada de supervisar: eso no se le pregunta aquí.
    expect(r.body.data.esSupervisor).toBeUndefined()
  })

  /** La pantalla no enseña el botón antes del umbral; la puerta lo vuelve a comprobar. */
  it('antes del umbral, la puerta no acepta el check-in', async () => {
    const r = await suEnlace('post').send({ need: 'DESCARGARME' })
    expect(r.status).toBe(409)
    expect(r.body.message).toContain('a partir de 3')
    expect(await prisma.professionalCheckIn.count({ where: { professionalId: ids.acompana } })).toBe(0)
  })

  it('con la tercera sesión hecha, el espacio se abre', async () => {
    await sesionHecha(ids.acompana, ids.persona, ids.asignacion, 24)
    const r = await suEnlace('get')
    expect(r.body.data.sesiones).toBe(3)
    expect(r.body.data.habilitado).toBe(true)
  })

  it('el check-in entra con la carga con la que llegó, y sin necesidad no entra', async () => {
    const sinNecesidad = await suEnlace('post').send({ notes: 'ando cansada' })
    expect(sinNecesidad.status).toBe(422)

    const r = await suEnlace('post').send({
      need: 'AYUDA_CON_UN_CASO',
      notes: 'Hay un caso que me está pesando.',
      questionForGroup: 'Cómo poner límites cuando la persona escribe fuera de la sesión',
    })
    expect(r.status).toBe(201)

    const guardado = await prisma.professionalCheckIn.findFirst({ where: { professionalId: ids.acompana } })
    expect(guardado.need).toBe('AYUDA_CON_UN_CASO')
    expect(guardado.sessionsAtCheckIn).toBe(3)
    expect(guardado.groupSessionId).toBeNull()
    ids.checkIn = guardado.id
  })

  /** Supervisar tampoco se pregunta aquí: lo marca coordinación desde la ficha. */
  it('su enlace no dice nada de supervisar', async () => {
    const r = await suEnlace('get')
    expect(r.body.data.esSupervisor).toBeUndefined()
    const p = await prisma.professional.findUnique({ where: { id: ids.acompana } })
    expect(p.supervisorVolunteer).toBe(false)
  })
})

describe('desde el portal', () => {
  const comoAdmin = (metodo, ruta) => request(app)[metodo](`/api/cuidado${ruta}`).set('Authorization', `Bearer ${tokenAdmin}`)
  const comoLectura = (metodo, ruta) =>
    request(app)[metodo](`/api/cuidado${ruta}`).set('Authorization', `Bearer ${tokenLectura}`)

  it('sin sesión, 401', async () => {
    expect((await request(app).get('/api/cuidado')).status).toBe(401)
  })

  it('el resumen trae el check-in pendiente y a quien se ofreció', async () => {
    // El que facilita lo marca coordinación desde su ficha: la única puerta.
    const ofrecer = await comoAdmin('patch', `/supervisores/${ids.facilita}`).send({ disponible: true })
    expect(ofrecer.status).toBe(200)
    const marcado = await prisma.professional.findUnique({ where: { id: ids.facilita } })
    expect(marcado.supervisorVolunteer).toBe(true)
    expect(marcado.supervisorVolunteerAt).not.toBeNull()

    const r = await comoAdmin('get', '')
    expect(r.status).toBe(200)
    expect(r.body.data.umbral).toBe(3)
    expect(r.body.data.checkInsPendientes.map((c) => c.id)).toContain(ids.checkIn)
    expect(r.body.data.supervisores.map((s) => s.id)).toContain(ids.facilita)
    // Quien no fue marcado no está.
    expect(r.body.data.supervisores.map((s) => s.id)).not.toContain(ids.acompana)
  })

  /**
   * El puente que faltaba: sin esta lista, el módulo esperaba a que alguien
   * cargado se acordara solo de pedir ayuda.
   */
  it('lista a quién ofrecerle el espacio, con su enlace firmado', async () => {
    const r = await comoAdmin('get', '')
    const suyo = r.body.data.paraOfrecer.find((p) => p.id === ids.facilita)
    expect(suyo).toBeUndefined() // no llega al umbral

    // El que sí llegó ya pidió el espacio, así que sale de la lista.
    expect(r.body.data.paraOfrecer.map((p) => p.id)).not.toContain(ids.acompana)
  })

  it('solo lectura ve, pero no convoca', async () => {
    expect((await comoLectura('get', '')).status).toBe(200)
    const r = await comoLectura('post', '/sesiones').send({
      facilitatorId: ids.facilita,
      startsAt: new Date(Date.now() + 48 * 3600000).toISOString(),
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      invitados: [ids.acompana],
    })
    expect(r.status).toBe(403)
  })

  it('no se convoca con alguien que no se ofreció, ni en el pasado', async () => {
    const noOfrecido = await comoAdmin('post', '/sesiones').send({
      facilitatorId: ids.acompana,
      startsAt: new Date(Date.now() + 48 * 3600000).toISOString(),
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      invitados: [ids.facilita],
    })
    expect(noOfrecido.status).toBe(409)

    const pasado = await comoAdmin('post', '/sesiones').send({
      facilitatorId: ids.facilita,
      startsAt: hace(2).toISOString(),
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      invitados: [ids.acompana],
    })
    expect(pasado.status).toBe(409)
  })

  /** El corazón: convocar arma la agenda, engancha los check-ins y avisa a todos. */
  it('convocar arma la agenda con las preguntas, engancha el check-in y avisa a todos', async () => {
    const r = await comoAdmin('post', '/sesiones').send({
      facilitatorId: ids.facilita,
      startsAt: new Date(Date.now() + 72 * 3600000).toISOString(),
      duracionMinutos: 90,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      invitados: [ids.acompana],
    })
    expect(r.status).toBe(201)
    ids.sesion = r.body.data.id

    const sesion = await prisma.supportGroupSession.findUnique({
      where: { id: ids.sesion },
      include: { invitations: true, checkIns: true },
    })
    expect(sesion.status).toBe('PROGRAMADA')
    expect(sesion.invitations.map((i) => i.professionalId)).toEqual([ids.acompana])
    // La agenda se armó sola con la pregunta que dejó.
    expect(sesion.agenda).toContain('Cómo poner límites')
    expect(sesion.agenda).toContain('necesita ayuda con un caso')
    // Y el check-in dejó de estar pendiente: apunta a esta sesión.
    expect(sesion.checkIns.map((c) => c.id)).toEqual([ids.checkIn])
    // 90 minutos.
    expect(new Date(sesion.endsAt).getTime() - new Date(sesion.startsAt).getTime()).toBe(90 * 60000)

    // El correo salió a la invitada y al facilitador, cada uno con su enlace.
    const avisos = await prisma.notification.findMany({ where: { entityId: ids.sesion, template: 'SESION_GRUPAL' } })
    expect(avisos.map((a) => a.toEmail).sort()).toEqual(
      [`prof.acompana.${MARCA}@pruebas.local`, `prof.facilita.${MARCA}@pruebas.local`].sort(),
    )
    expect(avisos[0].payload.enlace).toBe('https://meet.google.com/abc-defg-hij')

    // Y ya no sale como pendiente en el resumen.
    const resumen = await comoAdmin('get', '')
    expect(resumen.body.data.checkInsPendientes.map((c) => c.id)).not.toContain(ids.checkIn)
    expect(resumen.body.data.sesiones.map((s) => s.id)).toContain(ids.sesion)
  })

  it('el profesional ve desde su enlace que ya tiene sesión convocada', async () => {
    const r = await suEnlace('get')
    const mio = r.body.data.checkIns.find((c) => c.id === ids.checkIn)
    expect(mio.sesionGrupal?.id).toBe(ids.sesion)
    expect(mio.sesionGrupal?.estado).toBe('PROGRAMADA')
  })

  it('se marca quién estuvo y la sesión queda realizada; después ya no se toca', async () => {
    const asistencia = await comoAdmin('patch', `/sesiones/${ids.sesion}/asistencia`).send({ asistieron: [] })
    expect(asistencia.status).toBe(200)
    const inv = await prisma.supportGroupInvitation.findFirst({ where: { sessionId: ids.sesion } })
    expect(inv.attended).toBe(false)

    const hecha = await comoAdmin('patch', `/sesiones/${ids.sesion}/estado`).send({ estado: 'REALIZADA' })
    expect(hecha.status).toBe(200)
    expect(hecha.body.data.estado).toBe('REALIZADA')

    // Una máquina de estados chica, con la misma disciplina: de REALIZADA no se sale.
    const otraVez = await comoAdmin('patch', `/sesiones/${ids.sesion}/estado`).send({ estado: 'CANCELADA' })
    expect(otraVez.status).toBe(409)
  })
})

/** Y el punto del menú cuenta lo que nadie ha convocado. */
describe('el punto del menú', () => {
  it('cuenta los check-ins sin sesión', async () => {
    const r = await request(app).get('/api/dashboard/badges').set('Authorization', `Bearer ${tokenAdmin}`)
    expect(r.status).toBe(200)
    expect(typeof r.body.data.cuidado).toBe('number')
  })
})
