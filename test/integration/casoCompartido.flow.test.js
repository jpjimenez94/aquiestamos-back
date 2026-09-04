import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'

/**
 * El enlace de caso compartido es la única puerta pública que devuelve datos de
 * un paciente: no pasa por `authenticate`, solo por el enlace más el correo.
 *
 * Estas pruebas fijan las tres cosas de las que depende que eso sea seguro:
 * que el token no se pueda falsificar, que deje de servir cuando el caso se
 * cierra, y que la respuesta no arrastre más campos de los necesarios.
 */

const app = createApp()
const marca = `caso-${process.pid}`
// Con puntos a propósito: es la forma más común de correo y rompía el formato
// anterior de token, que separaba por el primer punto.
const CORREO = `ana.maria.${marca}@ejemplo.com`

const ids = {}
/** Token del profesional asignado, pedido una sola vez. Ver el `beforeAll`. */
let tokenValido

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
    },
  })

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Paciente ${marca}`,
      phone: '3009998877',
      email: `paciente.${marca}@ejemplo.com`,
      city: 'Medellín',
      preferredModality: 'VIRTUAL',
      preferredContact: 'WHATSAPP',
      availableDays: ['LUNES'],
      availableSlots: ['TARDE'],
      status: 'ASIGNADO',
    },
  })

  const asignacion = await prisma.caseAssignment.create({
    data: { patientId: paciente.id, professionalId: profesional.id, status: 'ACTIVA' },
  })

  Object.assign(ids, {
    profesional: profesional.id,
    paciente: paciente.id,
    asignacion: asignacion.id,
  })

  /**
   * Un token pedido antes que nada, para los bloques del final.
   *
   * El límite de intentos es de diez por ventana y cuenta para todo el fichero;
   * las pruebas de autenticación de aquí abajo gastan varios a propósito
   * —correo ajeno, caso inventado, token manipulado—. Quien pida el suyo al
   * final se lo encuentra agotado y falla por el motivo equivocado.
   */
  const auth = await request(app)
    .post(`/api/shared-cases/${paciente.id}/auth`)
    .send({ email: CORREO })
  tokenValido = auth.body?.data?.token
})

afterAll(async () => {
  await prisma.caseReport.deleteMany({ where: { assignmentId: ids.asignacion } })
  await prisma.auditLog.deleteMany({ where: { entityId: ids.paciente } })
  await prisma.caseAssignment.deleteMany({ where: { patientId: ids.paciente } })
  await prisma.patient.deleteMany({ where: { id: ids.paciente } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
  await prisma.$disconnect()
})

async function pedirToken(correo = CORREO) {
  const res = await request(app).post(`/api/shared-cases/${ids.paciente}/auth`).send({ email: correo })
  return res
}

describe('caso compartido', () => {
  it('deja entrar al profesional asignado, aunque su correo tenga puntos', async () => {
    const res = await pedirToken()
    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
  })

  it('no distingue entre un correo ajeno y un caso que no existe', async () => {
    const ajeno = await pedirToken(`otra.persona.${marca}@ejemplo.com`)
    const inventado = await request(app)
      .post('/api/shared-cases/00000000-0000-4000-8000-000000000000/auth')
      .send({ email: CORREO })

    expect(ajeno.status).toBe(403)
    expect(inventado.status).toBe(403)
    // Mismo texto: desde afuera no se puede deducir quién pertenece a la red.
    expect(ajeno.body.message).toBe(inventado.body.message)
  })

  it('entrega solo los campos que el profesional necesita', async () => {
    const { body } = await pedirToken()
    const res = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', body.data.token)

    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data).sort()).toEqual(
      [
        /**
         * Su propia disponibilidad. Es el único campo de aquí que NO es de la
         * persona acompañada, y por eso puede estar.
         *
         * Se le pide confirmar que sus espacios «siguen vigentes» y no los ve
         * por ningún lado: la agenda la mantiene coordinación desde la ficha, y
         * a esta pantalla se entra con un enlace y un correo, no con una cuenta.
         */
        'agenda',
        // Las mismas franjas en crudo: `agenda` es lo que se lee, esto lo que
        // se corrige desde su enlace.
        'franjas',
        // Si ya dijo que puede. Cambia la pregunta que se le hace, no la
        // puerta de salida.
        'confirmadoEn',
        'appointments',
        'availableDays',
        'availableSlots',
        'city',
        'contactName',
        'decidir',
        // Si todavía puede decir que no. Va aquí y no se calcula en la pantalla:
        // depende del estado de la asignación, que el profesional no ve.
        'puedeDeclinar',
        'email',
        'estado',
        'fullName',
        'isMinor',
        'phone',
        'preferredContact',
        'preferredModality',
        'relationship',
        'reportes',
        // Con qué urgencia hay que buscar a la persona. El profesional
        // necesita saberlo tanto como quien coordina.
        'priority',
        'prioridadLegible',
      ].sort(),
    )
    // Lo que no debe salir nunca por esta puerta.
    expect(res.body.data.id).toBeUndefined()
    expect(res.body.data.supportRequestId).toBeUndefined()
    expect(res.body.data.status).toBeUndefined()
  })

  it('rechaza un token manipulado', async () => {
    const { body } = await pedirToken()
    const alterado = body.data.token.slice(0, -1) + (body.data.token.endsWith('a') ? 'b' : 'a')

    const res = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', alterado)

    expect(res.status).toBe(401)
  })

  it('no sirve para leer otro caso', async () => {
    const { body } = await pedirToken()
    const res = await request(app)
      .get(`/api/shared-cases/${ids.profesional}`)
      .set('x-shared-case-token', body.data.token)

    expect(res.status).toBe(401)
  })

  it('deja de servir en cuanto el caso se cierra, sin esperar a que venza', async () => {
    const { body } = await pedirToken()
    const token = body.data.token

    const antes = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', token)
    expect(antes.status).toBe(200)

    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'CERRADA' },
    })

    const despues = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', token)
    expect(despues.status).toBe(403)

    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'ACTIVA' },
    })
  })

  it('deja rastro en auditoría de quien entra y de quien lo intenta', async () => {
    await pedirToken()
    await pedirToken(`intruso.${marca}@ejemplo.com`)

    const registros = await prisma.auditLog.findMany({
      where: { entity: 'CasoCompartido', entityId: ids.paciente },
    })

    expect(registros.some((r) => r.action === 'acceder')).toBe(true)
    expect(registros.some((r) => r.action === 'acceso_fallido')).toBe(true)
  })
})

describe('el profesional responde qué pasó', () => {
  /**
   * El token del `beforeAll` de arriba, pedido una sola vez.
   *
   * Es lo que pasa de verdad —el profesional confirma su correo una vez y de
   * ahí en adelante usa el enlace— y quita la fragilidad: el límite de intentos
   * es de diez para todo el fichero, así que cada bloque que pedía el suyo
   * acercaba al siguiente al borde. Añadir una prueba de autenticación arriba
   * rompía un bloque del final por un motivo que no tenía nada que ver.
   */
  const t = () => tokenValido

  it('registra lo que pasó y lo devuelve en el propio enlace', async () => {
    const enviado = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t())
      .send({
        outcome: 'NO_CONTESTA',
        contactDifficulties: 'La llamé tres veces y entra a buzón.',
      })
    expect(enviado.status).toBe(201)

    const caso = await request(app)
      .get(`/api/shared-cases/${ids.paciente}`)
      .set('x-shared-case-token', t())

    expect(caso.body.data.reportes).toHaveLength(1)
    expect(caso.body.data.reportes[0].outcome).toBe('NO_CONTESTA')
    // No se le repite su propio correo: ya sabe quién es.
    expect(caso.body.data.reportes[0].reportedByEmail).toBeUndefined()
  })

  it('una cita acordada necesita modalidad y fecha', async () => {
    const incompleto = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t())
      .send({ outcome: 'CITA_ACORDADA' })

    // 422: la petición está bien formada pero rompe una regla del formulario.
    expect(incompleto.status).toBe(422)
    expect(incompleto.body.details.modality).toBeTruthy()
    expect(incompleto.body.details.meetsAt).toBeTruthy()

    const completo = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t())
      .send({
        outcome: 'CITA_ACORDADA',
        modality: 'PRESENCIAL',
        /**
         * Por delante, siempre — y calculado, no escrito.
         *
         * Aquí había un 3 de septiembre de 2026 fijo. El validador exige que
         * la cita acordada esté en el futuro (esa regla nació de una fecha
         * tecleada al revés que se guardó con medio año de retraso), así que
         * la prueba era una bomba de relojería: verde hasta el 3 de
         * septiembre, roja para siempre desde el 4, sin que nadie tocara el
         * código que dice probar.
         */
        meetsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
    expect(completo.status).toBe(201)
  })

  it('no se puede reportar sin el enlace', async () => {
    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .send({ outcome: 'NO_CONTESTA' })
    expect(res.status).toBe(401)
  })

  it('deja de poderse reportar cuando el caso se cierra', async () => {
    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'CERRADA' },
    })

    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t())
      .send({ outcome: 'NO_CONTESTA' })
    expect(res.status).toBe(403)

    await prisma.caseAssignment.update({
      where: { id: ids.asignacion },
      data: { status: 'ACTIVA' },
    })
  })

  it('es una bitácora: los reportes se suman, no se pisan', async () => {
    const antes = await prisma.caseReport.count({ where: { assignmentId: ids.asignacion } })

    // `followUp` es obligatorio desde la migración `el_reporte_dice_que_sigue`:
    // un YA_ATENDIDA sin decir qué sigue deja el caso sin siguiente paso. Este
    // envío no lo traía y el reporte se rechazaba con 422, pero la prueba no
    // miraba el estado de la respuesta y el fallo salía como un conteo raro.
    // Por eso ahora se comprueba: si vuelve a romperse, que lo diga.
    const res = await request(app)
      .post(`/api/shared-cases/${ids.paciente}/reporte`)
      .set('x-shared-case-token', t())
      .send({ outcome: 'YA_ATENDIDA', modality: 'VIRTUAL', followUp: 'SUFICIENTE' })
    expect(res.status).toBe(201)

    const despues = await prisma.caseReport.count({ where: { assignmentId: ids.asignacion } })
    expect(despues).toBe(antes + 1)
  })
})

/**
 * Corregir su propia agenda desde el enlace.
 *
 * Le pedimos confirmar que sus espacios «siguen vigentes» y, si cambiaron, que
 * nos lo diga — y no tenía dónde: la ruta del portal exige una cuenta que él no
 * tiene a propósito. La petición se quedaba en un «escríbenos» sin destinatario.
 *
 * Lo que hay que cuidar aquí es de quién es la agenda que se toca. El enlace no
 * es una credencial para moverse por el sistema: es una llave para una puerta.
 */
describe('el profesional corrige su agenda desde su enlace', () => {
  // El del `beforeAll` de arriba: pedir uno aquí choca con el límite de
  // intentos, que ya han gastado las pruebas de autenticación.
  const t = () => tokenValido

  it('sin token no se puede tocar nada', async () => {
    const res = await request(app)
      .put(`/api/shared-cases/${ids.paciente}/disponibilidad`)
      .send({ franjas: [] })

    expect(res.status).toBe(401)
  })

  it('con su token, reemplaza sus franjas y eso confirma el caso', async () => {
    const res = await request(app)
      .put(`/api/shared-cases/${ids.paciente}/disponibilidad`)
      .set('x-shared-case-token', t())
      .send({
        franjas: [
          { weekday: 'MIERCOLES', startMinute: 14 * 60, endMinute: 18 * 60, modality: 'VIRTUAL' },
        ],
      })

    expect(res.status).toBe(200)

    const reglas = await prisma.availabilityRule.findMany({
      where: { professionalId: ids.profesional },
    })
    expect(reglas).toHaveLength(1)
    expect(reglas[0].weekday).toBe('MIERCOLES')

    /**
     * Pero NO da el caso por confirmado. Son dos afirmaciones distintas.
     *
     * Aquí se llamaba a `confirmar()`, razonando que dejar la agenda al día
     * decía más que pulsar un botón. Es una inferencia, y era mala: puede estar
     * poniendo sus horarios al día mientras todavía decide, o justamente para
     * enseñar por qué no puede tomarlo.
     *
     * Se vio en pantalla — guardaba sus horarios, la ficha daba el caso por
     * confirmado, y su propia pantalla le seguía preguntando «¿puedes
     * tomarlo?». El sistema afirmaba en su nombre algo que él no había dicho.
     */
    const asignacion = await prisma.caseAssignment.findFirst({
      where: { patientId: ids.paciente, professionalId: ids.profesional },
      orderBy: { startedAt: 'desc' },
    })
    expect(asignacion.professionalConfirmedAt).toBeNull()

    // Lo que sí queda al día es cuándo se reviso la agenda, que es otra cosa.
    const profesional = await prisma.professional.findUnique({
      where: { id: ids.profesional },
    })
    expect(profesional.availabilityConfirmedAt).not.toBeNull()
  })
})
