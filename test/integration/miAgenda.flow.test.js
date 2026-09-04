import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/config/database.js'
import { crearEnlaceAgenda } from '../../src/auth/enlaceAgenda.js'

const app = createApp()
const MARCA = `miagenda-${Date.now()}`

/**
 * La firma que viaja con la hora.
 *
 * Elegir hora y aceptar el consentimiento son un solo acto: sin firma no se
 * crea nada. El nombre tecleado ES la firma, y la versión dice qué texto
 * exacto aceptó.
 */
const FIRMA = { acepta: true, nombreFirma: 'Ana Ruiz Prueba', version: 'sesion-2026-08-2' }

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

  /**
   * Sin consentimiento no se crea NADA. Va antes de la reserva a propósito:
   * después ya habría firmado, y esto solo se puede probar sin firmar.
   *
   * Es el corazón del cambio. Antes se creaba la cita APARTADA y se le pedía
   * la firma en la pantalla siguiente: quien cerraba ahí dejaba ocupada una
   * hora que no servía para nada —sin consentimiento no se empieza la sesión—
   * y coordinación tenía que perseguir la firma o soltar el espacio a mano.
   * La hora bloqueada era real; la sesión, no.
   */
  it('sin consentimiento no se agenda, y no queda ninguna hora ocupada', async () => {
    const antes = await request(app).get(`/api/mi-agenda/${token}`)
    const hueco = antes.body.data.huecos[0]

    const res = await request(app).post(`/api/mi-agenda/${token}`).send({ inicio: hueco.inicio })
    expect(res.status).toBe(422)

    const cita = await prisma.appointment.findFirst({
      where: { patientId: pacienteId, startsAt: new Date(hueco.inicio) },
    })
    expect(cita).toBeNull()

    // Y la hora sigue ofreciéndose: no se quedó apartada por nadie.
    const despues = await request(app).get(`/api/mi-agenda/${token}`)
    expect(despues.body.data.huecos.some((h) => h.inicio === hueco.inicio)).toBe(true)
  })

  /** Aceptar sin escribir el nombre tampoco: el nombre ES la firma. */
  it('marcar la casilla sin firmar con el nombre no agenda', async () => {
    const antes = await request(app).get(`/api/mi-agenda/${token}`)
    const hueco = antes.body.data.huecos[0]

    const res = await request(app)
      .post(`/api/mi-agenda/${token}`)
      .send({ inicio: hueco.inicio, consentimiento: { acepta: true, version: 'sesion-2026-08-2' } })
    expect(res.status).toBe(422)
    expect(await prisma.appointment.count({ where: { patientId: pacienteId } })).toBe(0)
  })

  /** Y la pantalla sabe antes de elegir si le va a tocar firmar. */
  it('la agenda avisa si todavía no ha firmado', async () => {
    const res = await request(app).get(`/api/mi-agenda/${token}`)
    expect(res.body.data.consentimiento).toEqual({ firmado: false })
  })

  it('la persona reserva una hora y queda agendada', async () => {
    const antes = await request(app).get(`/api/mi-agenda/${token}`)
    const hueco = antes.body.data.huecos[0]

    const res = await request(app)
      .post(`/api/mi-agenda/${token}`)
      .send({ inicio: hueco.inicio, consentimiento: FIRMA })
    expect(res.status).toBe(201)

    const cita = await prisma.appointment.findFirst({
      where: { patientId: pacienteId, startsAt: new Date(hueco.inicio) },
    })
    expect(cita).not.toBeNull()
    expect(cita.professionalId).toBe(profesionalA.id)
  })

  /**
   * Nace CONFIRMADA y firmada, porque ya no le falta nada.
   *
   * Ha cambiado tres veces, y las tres por el mismo motivo: que el estado diga
   * la verdad. Nacía PROGRAMADA como una hora propuesta a ciegas, y el portal
   * ofrecía «Confirmar Cita» sobre la hora que ella misma acababa de escoger;
   * pasó a CONFIRMADA porque no quedaba nadie a quien preguntar; volvió a
   * PROGRAMADA porque sí quedaba algo —el consentimiento— y decirle «quedó
   * agendada» mientras se lo pedíamos era una promesa a medias.
   *
   * Ahora la firma viene en el mismo acto de elegir la hora, así que no queda
   * ningún trámite en el aire y el estado intermedio ya no representa nada.
   */
  it('la hora que elige ella nace confirmada y firmada', async () => {
    const cita = await prisma.appointment.findFirst({
      where: { patientId: pacienteId },
      orderBy: { createdAt: 'desc' },
    })
    expect(cita.status).toBe('CONFIRMADA')
    expect(cita.consentSigned).toBe(true)
    expect(cita.consentSignedAt).not.toBeNull()
  })

  /** Quién firmó y qué versión aceptó queda en la auditoría, no en la cita. */
  it('la firma deja rastro con su versión', async () => {
    const rastro = await prisma.auditLog.findFirst({
      where: { entity: 'cita_consentimiento' },
      orderBy: { createdAt: 'desc' },
    })
    expect(rastro).not.toBeNull()
    expect(rastro.after.firma).toBe(FIRMA.nombreFirma)
    expect(rastro.after.version).toBe(FIRMA.version)
  })

  /** Y a quien ya firmó no se le vuelve a pedir. */
  it('después de firmar, la agenda deja de pedir el consentimiento', async () => {
    const res = await request(app).get(`/api/mi-agenda/${token}`)
    expect(res.body.data.consentimiento).toEqual({ firmado: true })
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
        .send({
          inicio: hueco.inicio,
          consentimiento: { ...FIRMA, nombreFirma: 'Indiferente Prueba' },
        })
      expect(res.status).toBe(201)

      /**
       * Y sale firmada de una vez. Antes la respuesta traía un token para
       * firmar en la pantalla siguiente: eso era mejor que el enlace por
       * WhatsApp que hubo antes, pero seguía siendo un segundo paso que se
       * podía no dar.
       */
      expect(res.body.data.consentimiento).toEqual({ firmado: true })
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

  /**
   * Y sin volver a firmar: la firma es de la persona, no de la cita ni del
   * profesional. Pedírsela otra vez porque le cambiaron de profesional sería
   * cobrarle a ella un movimiento nuestro.
   */
  it('y agenda con el profesional nuevo, no con el anterior', async () => {
    const estado = await request(app).get(`/api/mi-agenda/${token}`)
    const hueco = estado.body.data.huecos[0]

    const res = await request(app).post(`/api/mi-agenda/${token}`).send({ inicio: hueco.inicio })
    expect(res.status).toBe(201)
    expect(res.body.data.consentimiento).toEqual({ firmado: true })

    const cita = await prisma.appointment.findFirst({
      where: { patientId: pacienteId, startsAt: new Date(hueco.inicio) },
    })
    expect(cita.professionalId).toBe(profesionalB.id)
  })
})
