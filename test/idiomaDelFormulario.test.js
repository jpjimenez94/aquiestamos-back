import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { idiomaDelFormulario, IDIOMAS_DEL_FORMULARIO } from '../src/validators/idioma.js'
import { supportRequestCreateSchema } from '../src/validators/supportRequest.schema.js'
import { volunteerCreateSchema } from '../src/validators/volunteer.schema.js'
import { collaboratorCreateSchema } from '../src/validators/collaborator.schema.js'
import { aprobarPostulacion } from '../src/services/promotion.service.js'
import { VERSION_ACTUAL } from '../src/consent/versions.js'
import { supportRequestAgendador } from '../src/views/supportRequest.view.js'
import { volunteerAdmin } from '../src/views/volunteer.view.js'
import { collaboratorAdmin } from '../src/views/collaborator.view.js'
import { profesionalBase } from '../src/views/professional.view.js'
import { pacienteParaAgendador, casoPropuesto, casoCompartido } from '../src/views/patient.view.js'

/**
 * En qué idioma se llenó cada formulario.
 *
 * El sitio público existe en español, inglés y portugués, y los tres guardan
 * las respuestas igual: una solicitud llegada en portugués era indistinguible
 * de una en español. Quien iba a llamar se enteraba de que la persona no
 * hablaba español cuando ya la tenía al teléfono.
 *
 * Lo que se fija aquí:
 *   · el idioma que manda el sitio se guarda, en los tres formularios;
 *   · viaja con la persona cuando la solicitud se admite, y con el profesional
 *     cuando la postulación se aprueba — el equipo trabaja desde esas fichas;
 *   · sale por todas las vistas que lo necesitan, también la del profesional
 *     que todavía no ha aceptado el caso;
 *   · y un idioma que no se reconoce NUNCA rechaza el envío de nadie.
 */

const app = createApp()
const marca = `idioma-${process.pid}`
// Un celular distinto por envío: con el mismo, la admisión avisa de un posible
// duplicado, que aquí sería ruido.
let consecutivo = 0
const celular = () => `30155${String(process.pid % 1000).padStart(3, '0')}${String(consecutivo++).padStart(2, '0')}`

const solicitud = (sufijo, extra = {}) => ({
  forWhom: 'PARA_MI',
  name: `Solicitud ${sufijo} ${marca}`,
  phone: celular(),
  preferredContact: 'WHATSAPP',
  city: 'São Paulo',
  preferredModality: 'VIRTUAL',
  consentVersion: VERSION_ACTUAL,
  dataConsent: true,
  sensitiveDataConsent: true,
  // Con las preguntas de prioridad la solicitud se admite sola, como en el
  // sitio: así se comprueba también que el idioma llega a la persona.
  distress: 2,
  selfHarmThoughts: false,
  howSoon: 'ESTA_SEMANA',
  safePlace: true,
  ...extra,
})

const postulacion = (sufijo, extra = {}) => ({
  fullName: `Postulación ${sufijo}`,
  phone: celular(),
  email: `${sufijo}.${marca}@ejemplo.com`,
  city: 'Lisboa',
  profession: 'Psicología',
  yearsExperience: 'ENTRE_3_Y_5',
  professionalCard: 'SI',
  populations: ['Adultos'],
  crisisExperience: 'SI',
  modality: 'VIRTUAL',
  availableDays: ['MARTES'],
  availableSlots: ['TARDE'],
  weeklyHours: 'ENTRE_1_Y_3',
  consentVersion: VERSION_ACTUAL,
  dataConsent: true,
  ...extra,
})

const apoyo = (sufijo, extra = {}) => ({
  fullName: `Apoyo ${sufijo}`,
  phone: celular(),
  email: `${sufijo}.${marca}@ejemplo.com`,
  city: 'Miami',
  area: 'OPERACION_LOGISTICA',
  discipline: 'Logística',
  modality: 'VIRTUAL',
  availableDays: ['LUNES'],
  availableSlots: ['TARDE'],
  weeklyHours: 'ENTRE_4_Y_6',
  consentVersion: VERSION_ACTUAL,
  dataConsent: true,
  ...extra,
})

afterAll(async () => {
  const solicitudes = await prisma.supportRequest.findMany({
    where: { name: { contains: marca } },
    select: { id: true },
  })
  const idsSolicitud = solicitudes.map((s) => s.id)
  await prisma.patient.deleteMany({ where: { supportRequestId: { in: idsSolicitud } } })
  await prisma.supportRequest.deleteMany({ where: { id: { in: idsSolicitud } } })

  const postulaciones = await prisma.volunteer.findMany({
    where: { email: { contains: marca } },
    select: { id: true },
  })
  await prisma.professional.deleteMany({
    where: { volunteerId: { in: postulaciones.map((p) => p.id) } },
  })
  await prisma.volunteer.deleteMany({ where: { email: { contains: marca } } })
  await prisma.collaborator.deleteMany({ where: { email: { contains: marca } } })
  await prisma.$disconnect()
})

describe('el idioma que manda el formulario', () => {
  it('reconoce los tres idiomas del sitio', () => {
    for (const idioma of IDIOMAS_DEL_FORMULARIO) {
      expect(idiomaDelFormulario.parse(idioma)).toBe(idioma)
    }
    expect(IDIOMAS_DEL_FORMULARIO).toEqual(['es', 'en', 'pt'])
  })

  it('se queda con la lengua y descarta el país y las mayúsculas', () => {
    expect(idiomaDelFormulario.parse('pt-BR')).toBe('pt')
    expect(idiomaDelFormulario.parse('EN')).toBe('en')
    expect(idiomaDelFormulario.parse(' es_CO ')).toBe('es')
  })

  it('da «no se sabe» ante lo que no reconoce, en vez de fallar', () => {
    for (const raro of ['fr', 'klingon', '', '   ', 42, null, undefined, {}, ['pt']]) {
      expect(idiomaDelFormulario.safeParse(raro)).toEqual({ success: true, data: undefined })
    }
  })

  it.each([
    ['atención', supportRequestCreateSchema, solicitud('esquema')],
    ['profesionales', volunteerCreateSchema, postulacion('esquema')],
    ['apoyo', collaboratorCreateSchema, apoyo('esquema')],
  ])('el formulario de %s lo acepta, y sigue valiendo sin él o con uno inventado', (_n, esquema, base) => {
    expect(esquema.safeParse({ ...base, locale: 'pt' }).data?.locale).toBe('pt')

    const sinIdioma = esquema.safeParse(base)
    expect(sinIdioma.success).toBe(true)
    expect(sinIdioma.data.locale).toBeUndefined()

    // Lo importante: un dato que la persona ni siquiera tecleó no puede
    // devolverle un error a quien está pidiendo ayuda.
    const inventado = esquema.safeParse({ ...base, locale: 'xx-YY' })
    expect(inventado.success).toBe(true)
    expect(inventado.data.locale).toBeUndefined()
  })
})

describe('una solicitud de ayuda en otro idioma', () => {
  it('guarda el idioma y lo lleva a la ficha de la persona al admitirla', async () => {
    const res = await request(app)
      .post('/api/support-requests')
      .send(solicitud('portugues', { locale: 'pt' }))
    expect(res.status).toBe(201)

    const guardada = await prisma.supportRequest.findUnique({ where: { id: res.body.data.id } })
    expect(guardada.formLocale).toBe('pt')
    // Lo que respondió se guarda igual que en español: el idioma no cambia
    // los valores, solo queda anotado.
    expect(guardada.preferredModality).toBe('VIRTUAL')

    const persona = await prisma.patient.findUnique({ where: { supportRequestId: guardada.id } })
    expect(persona, 'la solicitud con tamizaje se admite sola').toBeTruthy()
    expect(persona.formLocale).toBe('pt')
  })

  it('guarda «no se sabe» si el sitio no lo manda', async () => {
    const res = await request(app).post('/api/support-requests').send(solicitud('sin-idioma'))
    expect(res.status).toBe(201)

    const guardada = await prisma.supportRequest.findUnique({ where: { id: res.body.data.id } })
    expect(guardada.formLocale).toBeNull()
    const persona = await prisma.patient.findUnique({ where: { supportRequestId: guardada.id } })
    expect(persona.formLocale).toBeNull()
  })

  it('se recibe igual aunque el idioma llegue con un valor que no existe', async () => {
    const res = await request(app)
      .post('/api/support-requests')
      .send(solicitud('idioma-raro', { locale: 'klingon' }))
    expect(res.status).toBe(201)

    const guardada = await prisma.supportRequest.findUnique({ where: { id: res.body.data.id } })
    expect(guardada.formLocale).toBeNull()
  })

  it('no devuelve el idioma en el acuse: quien envía ya sabe en cuál escribió', async () => {
    const res = await request(app)
      .post('/api/support-requests')
      .send(solicitud('acuse', { locale: 'en' }))
    expect(Object.keys(res.body.data).sort()).toEqual(['createdAt', 'id', 'name'])
  })
})

describe('una postulación de profesional en otro idioma', () => {
  it('guarda el idioma y lo lleva a la ficha del profesional al aprobarla', async () => {
    const res = await request(app)
      .post('/api/volunteers')
      .send(postulacion('ingles', { locale: 'en' }))
    expect(res.status).toBe(201)

    const guardada = await prisma.volunteer.findUnique({ where: { id: res.body.data.id } })
    expect(guardada.formLocale).toBe('en')

    // En producción la aprobación es automática al enviar; en las pruebas se
    // pide aquí, que es el mismo camino.
    const { profesional } = await aprobarPostulacion({ volunteerId: guardada.id })
    expect(profesional.formLocale).toBe('en')
  })
})

describe('un registro de voluntariado de apoyo en otro idioma', () => {
  it('guarda el idioma', async () => {
    const res = await request(app)
      .post('/api/collaborators')
      .send(apoyo('portugues', { locale: 'pt' }))
    expect(res.status).toBe(201)

    const guardado = await prisma.collaborator.findUnique({ where: { id: res.body.data.id } })
    expect(guardado.formLocale).toBe('pt')
  })
})

describe('el idioma sale por las vistas del portal', () => {
  const persona = {
    id: 'p1',
    fullName: 'Ana',
    phone: '3000000000',
    city: 'Lisboa',
    createdAt: new Date(),
    formLocale: 'pt',
  }

  it('en la solicitud, la postulación y el registro de apoyo', () => {
    expect(supportRequestAgendador({ formLocale: 'en' }).formLocale).toBe('en')
    expect(volunteerAdmin({ formLocale: 'pt' }).formLocale).toBe('pt')
    expect(collaboratorAdmin({ formLocale: 'en' }).formLocale).toBe('en')
  })

  it('en la ficha de la persona, que es desde donde se la llama', () => {
    expect(pacienteParaAgendador(persona).formLocale).toBe('pt')
  })

  it('en lo que ve el profesional ANTES de aceptar el caso', () => {
    // No identifica a nadie y es justo lo que hace falta para decidir si
    // puede acompañar a esa persona.
    const propuesta = casoPropuesto(persona)
    expect(propuesta.formLocale).toBe('pt')
    expect(propuesta).not.toHaveProperty('fullName')
    expect(propuesta).not.toHaveProperty('phone')
  })

  it('en el caso ya aceptado y en la ficha del profesional', () => {
    expect(casoCompartido(persona, []).formLocale).toBe('pt')
    expect(profesionalBase({ formLocale: 'en' }).formLocale).toBe('en')
  })

  it('como null, y no como ausente, cuando no se sabe', () => {
    // El portal distingue «no se sabe» de «en español»: solo etiqueta lo que
    // llegó en otro idioma.
    expect(supportRequestAgendador({}).formLocale).toBeNull()
    expect(pacienteParaAgendador({ createdAt: new Date() }).formLocale).toBeNull()
    expect(profesionalBase({}).formLocale).toBeNull()
  })
})
