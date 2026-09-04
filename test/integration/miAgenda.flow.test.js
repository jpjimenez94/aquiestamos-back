import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { crearEnlaceAgenda } from '../../src/auth/enlaceAgenda.js'
import { crearEnlaceConsentimiento } from '../../src/auth/enlaceConsentimiento.js'

const app = createApp()
const MARCA = `miagenda-${Date.now()}`

/**
 * La persona agenda su propia sesión.
 *
 * Lo que de verdad se prueba aquí no es que se pueda reservar una hora: es que
 * el enlace es de la PERSONA y no del par con su profesional. En un
 * acompañamiento se cambia de profesional a mitad de camino —en la tercera
 * sesión, si hace falta— y el acompañamiento sigue con la persona. Si el
 * enlace fuera del par, cada cambio obligaría a mandar uno nuevo justo cuando
 * la persona ya está desorientada.
 */

let pacienteId
let profesionalA
let profesionalB
let token

async function crearProfesional(sufijo) {
  const p = await prisma.professional.create({
    data: {
      fullName: `Profesional ${sufijo} ${MARCA}`,
      email: `prof.${sufijo}.${MARCA}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
      maxActiveCases: 5,
    },
  })
  // Disponibilidad amplia todos los días, para que siempre haya huecos.
  // Los minutos van desde medianoche: 8:00 = 480, 18:00 = 1080.
  await prisma.availabilityRule.createMany({
    data: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((d) => ({
      professionalId: p.id,
      weekday: d,
      startMinute: 8 * 60,
      endMinute: 18 * 60,
      modality: 'AMBAS',
    })),
  })
  return p
}

beforeAll(async () => {
  profesionalA = await crearProfesional('A')
  profesionalB = await crearProfesional('B')

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Persona ${MARCA}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      priority: 'MEDIA',
      preferredModality: 'VIRTUAL',
    },
  })
  pacienteId = paciente.id
  token = crearEnlaceAgenda(pacienteId)

  await prisma.caseAssignment.create({
    data: {
      patientId: pacienteId,
      professionalId: profesionalA.id,
      status: 'ACTIVA',
      startedAt: new Date(),
      respondedAt: new Date(),
    },
  })
})

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { patientId: pacienteId } })
  await prisma.caseAssignment.deleteMany({ where: { patientId: pacienteId } })
  await prisma.patient.deleteMany({ where: { id: pacienteId } })
  for (const p of [profesionalA, profesionalB]) {
    await prisma.availabilityRule.deleteMany({ where: { professionalId: p.id } })
    await prisma.professional.deleteMany({ where: { id: p.id } })
  }
  await prisma.auditLog.deleteMany({ where: { entityId: pacienteId } })
})

describe('mi agenda', () => {
  it('un enlace inventado no abre nada', async () => {
    const res = await request(app).get('/api/mi-agenda/esto-no-es-un-token')
    expect(res.status).toBe(404)
  })

  it('muestra con quién es y qué horas quedan libres', async () => {
    const res = await request(app).get(`/api/mi-agenda/${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.profesional).toContain('Profesional A')
    expect(res.body.data.huecos.length).toBeGreaterThan(0)
  })

  it('solo enseña el nombre de pila de la persona', async () => {
    const res = await request(app).get(`/api/mi-agenda/${token}`)

    // El nombre completo de alguien en acompañamiento no tiene por qué viajar
    // en una respuesta pública. El del PROFESIONAL sí va completo, y es a
    // propósito: la persona tiene derecho a saber con quién se va a sentar, y
    // eso es dato profesional, no íntimo. Por eso se comprueba solo el de ella.
    expect(res.body.data.persona).toBe('Persona')
    expect(JSON.stringify(res.body.data.persona)).not.toContain(MARCA)
  })

  it('la persona reserva una hora y queda agendada', async () => {
    const antes = await request(app).get(`/api/mi-agenda/${token}`)
    const hueco = antes.body.data.huecos[0]

    const res = await request(app).post(`/api/mi-agenda/${token}`).send({ inicio: hueco.inicio })
    expect(res.status).toBe(201)

    const cita = await prisma.appointment.findFirst({
      where: { patientId: pacienteId, startsAt: new Date(hueco.inicio) },
    })
    expect(cita).not.toBeNull()
    expect(cita.professionalId).toBe(profesionalA.id)
  })

  /**
   * Nace APARTADA. La confirma la firma del consentimiento.
   *
   * Ha ido cambiando dos veces, y las dos por el mismo motivo: que el estado
   * diga la verdad. Nacía PROGRAMADA como una hora propuesta a ciegas, y el
   * portal ofrecía un botón «Confirmar Cita» sobre la hora que ella misma
   * acababa de escoger; se pasó a CONFIRMADA porque no quedaba nadie a quien
   * preguntar.
   *
   * Pero sí quedaba algo: el consentimiento. La pantalla le decía «tu sesión
   * quedó agendada» y justo debajo se lo pedía. Si cerraba sin firmar, la cita
   * seguía en pie y confirmada, el profesional ya tenía su aviso, el espacio
   * estaba ocupado — y la sesión no podía hacerse, porque sin consentimiento
   * no se empieza. Estaba confirmada todo menos de verdad.
   *
   * PROGRAMADA le guarda la hora mientras lee: perder el espacio por leer
   * sería peor. Firmar es lo que confirma.
   */
  it('la hora que elige ella queda apartada, y la confirma la firma', async () => {
    const cita = await prisma.appointment.findFirst({
      where: { patientId: pacienteId },
      orderBy: { createdAt: 'desc' },
    })
    expect(cita.status).toBe('PROGRAMADA')
    expect(cita.consentSigned).toBe(false)
  })

  /**
   * Y firmar es lo que la confirma. Ese es el otro lado del cambio.
   *
   * Sin esto, «apartada» se quedaría en apartada para siempre y habría que
   * confirmarla a mano desde el portal — que es justo el botón que se quitó
   * cuando la hora pasó a elegirla ella.
   */
  it('al firmar el consentimiento, la cita queda confirmada', async () => {
    const antes = await prisma.appointment.findFirst({
      where: { patientId: pacienteId },
      orderBy: { createdAt: 'desc' },
    })
    expect(antes.status).toBe('PROGRAMADA')

    const res = await request(app)
      .post(`/api/consentimiento/${crearEnlaceConsentimiento(antes.id)}`)
      .send({ acepta: true, nombreFirma: 'Ana Ruiz', version: '1.0' })

    expect(res.status).toBe(200)

    const despues = await prisma.appointment.findUnique({ where: { id: antes.id } })
    expect(despues.consentSigned).toBe(true)
    expect(despues.status).toBe('CONFIRMADA')
  })

  it('esa hora deja de ofrecerse', async () => {
    const despues = await request(app).get(`/api/mi-agenda/${token}`)
    const citas = await prisma.appointment.findMany({ where: { patientId: pacienteId } })
    const tomada = citas[0].startsAt.toISOString()
    expect(despues.body.data.huecos.some((h) => h.inicio === tomada)).toBe(false)
  })

  /**
   * La persona que marcó «indiferente».
   *
   * Su enlace daba «Error interno del servidor». INDIFERENTE es de la lista de
   * preferencias de la persona; la agenda del profesional solo conoce
   * PRESENCIAL, VIRTUAL y AMBAS, y el controlador pasaba el valor tal cual.
   * Prisma lo rechazó. Dos personas reales con caso vivo lo vieron antes que
   * nadie del equipo, porque las pruebas solo nacían con VIRTUAL.
   */
  describe('una persona a la que le da igual la modalidad', () => {
    let indiferente
    let tokenIndiferente

    beforeAll(async () => {
      indiferente = await prisma.patient.create({
        data: {
          fullName: `Indiferente ${MARCA}`,
          phone: '3000000009',
          city: 'Pereira',
          status: 'EN_ACOMPANAMIENTO',
          priority: 'MEDIA',
          preferredModality: 'INDIFERENTE',
        },
      })
      await prisma.caseAssignment.create({
        data: {
          patientId: indiferente.id,
          professionalId: profesionalA.id,
          status: 'ACEPTADA',
          respondedAt: new Date(),
        },
      })
      tokenIndiferente = crearEnlaceAgenda(indiferente.id)
    })

    afterAll(async () => {
      await prisma.appointment.deleteMany({ where: { patientId: indiferente.id } })
      await prisma.caseAssignment.deleteMany({ where: { patientId: indiferente.id } })
      await prisma.patient.deleteMany({ where: { id: indiferente.id } })
    })

    it('ve sus horas libres en vez de un error interno', async () => {
      const res = await request(app).get(`/api/mi-agenda/${tokenIndiferente}`)
      expect(res.status).toBe(200)
      expect(res.body.data.huecos.length).toBeGreaterThan(0)
    })

    it('y puede reservar: la sesión nace con una modalidad concreta', async () => {
      const antes = await request(app).get(`/api/mi-agenda/${tokenIndiferente}`)
      const hueco = antes.body.data.huecos[0]
      const res = await request(app)
        .post(`/api/mi-agenda/${tokenIndiferente}`)
        .send({ inicio: hueco.inicio })
      expect(res.status).toBe(201)

      /**
       * El consentimiento viene en la misma respuesta, para firmarlo en la
       * misma pantalla. Era otro enlace y otro mensaje por WhatsApp: dos
       * toques humanos para una firma que puede darse ahí mismo.
       */
      expect(res.body.data.consentimiento).toEqual({ firmado: false, token: expect.any(String) })
      const firma = await request(app)
        .post(`/api/consentimiento/${res.body.data.consentimiento.token}`)
        .send({ acepta: true, nombreFirma: 'Indiferente Prueba', version: 'sesion-2026-08-2' })
      expect(firma.status).toBe(200)
      const firmada = await prisma.appointment.findFirst({ where: { patientId: indiferente.id } })
      expect(firmada.consentSigned).toBe(true)

      const cita = await prisma.appointment.findFirst({ where: { patientId: indiferente.id } })
      // Nunca AMBAS ni INDIFERENTE: una sesión ocurre de una sola forma.
      expect(['PRESENCIAL', 'VIRTUAL']).toContain(cita.modality)
    })
  })

  it('no deja agendar una hora que ya pasó', async () => {
    const res = await request(app)
      .post(`/api/mi-agenda/${token}`)
      .send({ inicio: new Date(Date.now() - 86400000).toISOString() })
    expect(res.status).toBe(422)
  })

  /**
   * El margen para gestionar, exigido en la PUERTA y no solo en la lista.
   *
   * Entre que ella elige y la hora llega hay que avisar al profesional con el
   * enlace de la videollamada, pedirle el consentimiento y que coordinación
   * mire que todo esté en orden. Sin margen se podía reservar algo que empezaba
   * en diez minutos: la cita quedaba puesta, nadie llegaba a nada, y quien
   * pidió ayuda se quedaba sola en una sala.
   *
   * Se prueba mandando la petición directa —no pulsando un botón— porque eso es
   * lo que hace un enlace viejo o una pestaña abierta desde antes. Una regla que
   * solo vive en la pantalla no es una regla.
   */
  it('no deja agendar algo que empieza dentro de una hora', async () => {
    const enUnaHora = new Date(Date.now() + 3600000)

    const res = await request(app)
      .post(`/api/mi-agenda/${token}`)
      .send({ inicio: enUnaHora.toISOString() })

    expect(res.status).toBe(409)
    // Y le dice por qué: culpar a otro de haber tomado la hora cuando lo que
    // pasa es que eligió demasiado pronto la manda a buscar un culpable que no
    // existe.
    expect(res.body.message).toMatch(/muy cerca|horas para avisar/i)
  })

  it('las horas de las próximas tres horas no se ofrecen', async () => {
    const res = await request(app).get(`/api/mi-agenda/${token}`)
    const limite = Date.now() + 3 * 3600000

    for (const h of res.body.data.huecos) {
      expect(new Date(h.inicio).getTime()).toBeGreaterThan(limite)
    }
  })

  it('no deja agendar una hora que no está libre', async () => {
    // Una hora de madrugada, fuera de la disponibilidad declarada.
    const madrugada = new Date()
    madrugada.setDate(madrugada.getDate() + 2)
    madrugada.setHours(3, 0, 0, 0)

    const res = await request(app)
      .post(`/api/mi-agenda/${token}`)
      .send({ inicio: madrugada.toISOString() })
    expect(res.status).toBe(409)
  })

  /**
   * El caso que justifica todo el diseño.
   */
  it('tras cambiar de profesional, el MISMO enlace muestra la agenda del nuevo', async () => {
    const antes = await request(app).get(`/api/mi-agenda/${token}`)
    expect(antes.body.data.profesional).toContain('Profesional A')

    // El acompañamiento pasa de A a B, como en la vida real: A queda libre
    // para otras personas y la persona sigue con su proceso.
    await prisma.caseAssignment.updateMany({
      where: { patientId: pacienteId, status: 'ACTIVA' },
      data: { status: 'CERRADA', endedAt: new Date(), closeReason: 'Cambio de profesional' },
    })
    await prisma.caseAssignment.create({
      data: {
        patientId: pacienteId,
        professionalId: profesionalB.id,
        status: 'ACTIVA',
        startedAt: new Date(),
        respondedAt: new Date(),
      },
    })

    const despues = await request(app).get(`/api/mi-agenda/${token}`)
    expect(despues.status).toBe(200)
    expect(despues.body.data.profesional).toContain('Profesional B')
    expect(despues.body.data.huecos.length).toBeGreaterThan(0)
  })

  it('y agenda con el profesional nuevo, no con el anterior', async () => {
    const estado = await request(app).get(`/api/mi-agenda/${token}`)
    const hueco = estado.body.data.huecos[0]

    const res = await request(app).post(`/api/mi-agenda/${token}`).send({ inicio: hueco.inicio })
    expect(res.status).toBe(201)

    const cita = await prisma.appointment.findFirst({
      where: { patientId: pacienteId, startsAt: new Date(hueco.inicio) },
    })
    expect(cita.professionalId).toBe(profesionalB.id)
  })
})
