import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'

/**
 * Que el profesional pueda decir que no.
 *
 * El caso se le asigna sin preguntarle: le llega un mensaje diciendo que ya es
 * suyo y que la persona elegirá hora de su agenda. Eso ahorra los días que se
 * perdían esperando un «sí» que en siete de cada ocho casos no llegaba.
 *
 * Solo es justo con una condición, y es esta: decir «ahora no puedo» tiene que
 * seguir costando un toque. Si no, lo que se quitó no fue un paso — fue su
 * capacidad de negarse, y esto pasa de ser eficiencia a ser imposición.
 *
 * Durante un tiempo no se cumplió. Al quitar el paso de aceptar, la salida se
 * quedó colgando de PROPUESTA, por donde ya no pasa ninguna asignación nueva.
 * El mensaje prometía «dilo ahí mismo» y desde ACEPTADA no había ahí mismo. Y
 * había una prueba en verde afirmando que sí lo había: miraba PROPUESTA.
 *
 * Por eso esta recorre el camino de verdad —enlace, token, POST— en vez de
 * preguntarle a la tabla de transiciones. La tabla ya dijo que todo estaba bien
 * una vez.
 */

const app = createApp()
const marca = `declinar-${Date.now()}`
const CORREO = `ana.${marca}@pruebas.local`
const ids = {}

beforeAll(async () => {
  const profesional = await prisma.professional.create({
    data: {
      fullName: 'Ana María Pérez',
      email: CORREO,
      phone: '3001112233',
      city: 'Bogotá',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      status: 'ACTIVO',
      populations: ['Adultos'],
      maxActiveCases: 3,
    },
  })

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Paciente ${marca}`,
      phone: '3009998877',
      city: 'Medellín',
      preferredModality: 'VIRTUAL',
      preferredContact: 'WHATSAPP',
      status: 'ASIGNADO',
    },
  })

  Object.assign(ids, { profesional: profesional.id, paciente: paciente.id })
})

// Cada prueba parte de una asignación recién nacida, como las de verdad.
beforeEach(async () => {
  await prisma.caseAssignment.deleteMany({ where: { patientId: ids.paciente } })
  await prisma.caseAssignment.create({
    data: {
      patientId: ids.paciente,
      professionalId: ids.profesional,
      status: 'ACEPTADA',
      respondedAt: new Date(),
    },
  })
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: ids.paciente } })
  await prisma.caseAssignment.deleteMany({ where: { patientId: ids.paciente } })
  await prisma.patient.deleteMany({ where: { id: ids.paciente } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
  await prisma.notification.deleteMany({ where: { toEmail: CORREO } })
})

async function token() {
  const res = await request(app).post(`/api/shared-cases/${ids.paciente}/auth`).send({ email: CORREO })
  return res.body.data.token
}

async function estadoActual() {
  const a = await prisma.caseAssignment.findFirst({ where: { patientId: ids.paciente } })
  return a.status
}

describe('declinar un caso ya asignado', () => {
  it('la pantalla le dice que todavía puede', async () => {
    // Sin esto el botón no se pinta, y un botón que no se pinta es lo mismo
    // que no tener salida.
    const res = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', await token())

    expect(res.status).toBe(200)
    expect(res.body.data.puedeDeclinar).toBe(true)
  })

  it('declinar deja el caso libre para otro', async () => {
    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/propuesta`)
      .set('x-shared-case-token', await token())
      .send({ acepta: false, motivo: 'No tengo cupo este mes' })

    expect(res.status).toBe(200)
    expect(await estadoActual()).toBe('RECHAZADA')
  })

  /**
   * RECHAZADA y no CANCELADA. Son dos salidas a propósito: una dice «este
   * profesional no podía» y la otra «no se pudo cuadrar el horario». Que se
   * distingan en los cierres es lo único que permite ver si se está asignando
   * mal, en vez de creer que la gente no cuadra.
   */
  it('queda registrado como que él no podía, no como un horario que no cuadró', async () => {
    await request(app)
      .post(`/api/shared-cases/${ids.paciente}/propuesta`)
      .set('x-shared-case-token', await token())
      .send({ acepta: false, motivo: 'Me queda muy lejos' })

    const a = await prisma.caseAssignment.findFirst({ where: { patientId: ids.paciente } })
    expect(a.status).toBe('RECHAZADA')
    expect(a.status).not.toBe('CANCELADA')
    expect(a.declineReason).toContain('lejos')
  })

  /**
   * Y ella vuelve a «Por asignar».
   *
   * Esto es lo que separa un caso liberado de una persona perdida. La
   * asignación se cierra igual en los dos supuestos; la diferencia está en si
   * ella reaparece en la lista de quien coordina o se queda sin profesional y
   * fuera de la lista a la vez.
   *
   * Cancelar sí la devolvía, declinar no — y declinar acaba de convertirse en
   * la salida principal del profesional. No rompe nada visible: nadie la ve
   * esperando porque el tablero cree que está acompañada.
   */
  it('la persona vuelve a la cola, no se queda en el limbo', async () => {
    await prisma.patient.update({
      where: { id: ids.paciente },
      data: { status: 'EN_ACOMPANAMIENTO' },
    })

    await request(app)
      .post(`/api/shared-cases/${ids.paciente}/propuesta`)
      .set('x-shared-case-token', await token())
      .send({ acepta: false, motivo: 'Sin cupo' })

    const p = await prisma.patient.findUnique({ where: { id: ids.paciente } })
    expect(p.status).toBe('EN_ADMISION')
  })

  it('no deja declinar sin decir por qué', async () => {
    // Saber si fue por ciudad, por carga o por perfil distingue un problema de
    // este caso de un problema de cómo se está asignando.
    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/propuesta`)
      .set('x-shared-case-token', await token())
      .send({ acepta: false })

    // 422: la petición se entiende, pero le falta lo que la hace útil.
    expect(res.status).toBe(422)
    expect(await estadoActual()).toBe('ACEPTADA')
  })

  /**
   * Confirmar no puede devolverle un error.
   *
   * El mensaje le invita a responder y hay quien contesta «sí puedo» aunque no
   * haga falta. Antes eso era una transición ACEPTADA → ACEPTADA, que la
   * máquina de estados rechaza con razón: responder dos veces no vale. Pero
   * echarle un error en la cara a quien colabora es la peor manera de darle las
   * gracias.
   */
  it('confirmar que sí puede no da error y no cambia nada', async () => {
    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/propuesta`)
      .set('x-shared-case-token', await token())
      .send({ acepta: true })

    expect(res.status).toBe(200)
    expect(await estadoActual()).toBe('ACEPTADA')
  })

  /**
   * Con cita puesta ya no se declina: hay alguien esperando ese día y esa hora.
   * Soltarlo de un clic sería dejarla plantada; eso se habla con coordinación.
   */
  it('una vez que ella eligió hora, la puerta se cierra', async () => {
    await prisma.caseAssignment.updateMany({
      where: { patientId: ids.paciente },
      data: { status: 'ACTIVA' },
    })

    const t = await token()

    const vista = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', t)
    expect(vista.body.data.puedeDeclinar).toBe(false)

    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/propuesta`)
      .set('x-shared-case-token', t)
      .send({ acepta: false, motivo: 'Ya no puedo' })

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await estadoActual()).toBe('ACTIVA')
  })
})
