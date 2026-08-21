import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { SMTPServer } from 'smtp-server'
import { simpleParser } from 'mailparser'

/**
 * El circuito completo de los avisos, contra un servidor SMTP de mentira que
 * corre en esta misma máquina y guarda lo que recibe.
 *
 * Es la prueba que de verdad vale: cubre que el evento encola, que el
 * despachador envía, que llega lo que tiene que llegar y —sobre todo— que un
 * fallo del proveedor no rompe el formulario público ni pierde el aviso.
 *
 * Las variables de entorno se ponen ANTES de importar nada del proyecto,
 * porque `env.js` las lee al cargarse.
 */

const PUERTO_SMTP = 2599

// Sin esto, si la máquina tiene BREVO_API_KEY en su .env, el mailer prefiere
// la API y las pruebas llamarían al Brevo de verdad: correos reales a
// direcciones inventadas, cuota gastada y rebotes. Aquí se prueba el
// transporte SMTP contra el servidor de mentira de más abajo.
process.env.BREVO_API_KEY = ''
process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = String(PUERTO_SMTP)
process.env.SMTP_USER = 'prueba'
process.env.SMTP_PASSWORD = 'prueba'
process.env.SMTP_FROM = 'Red Aquí Estamos <no-responder@ejemplo.com>'
process.env.NOTIFICACIONES_COORDINACION = 'coordinacion@ejemplo.com'
process.env.SITIO_URL = 'https://redaquiestamos.org'

const { createApp } = await import('../../src/app.js')
const { prisma } = await import('../../src/config/database.js')
const { despachar } = await import('../../src/notifications/despachador.js')

const app = createApp()
const marca = `avisos-${process.pid}`

/** Lo que el servidor falso ha recibido. */
const recibidos = []
/** Si está en true, el servidor rechaza todo: sirve para probar reintentos. */
let rechazarTodo = false

let servidor

beforeAll(async () => {
  servidor = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    // Sin esto el servidor responde "535 Authentication not implemented" y no
    // se estaría probando el camino real, que sí autentica.
    onAuth(credenciales, sesion, listo) {
      listo(null, { user: credenciales.username })
    },
    onData(flujo, sesion, listo) {
      simpleParser(flujo)
        .then((correo) => {
          if (rechazarTodo) return listo(new Error('451 buzón temporalmente no disponible'))
          recibidos.push({
            para: correo.to?.text ?? '',
            asunto: correo.subject ?? '',
            texto: correo.text ?? '',
            html: correo.html || '',
          })
          listo()
        })
        .catch(listo)
    },
  })

  await new Promise((resolver) => servidor.listen(PUERTO_SMTP, '127.0.0.1', resolver))

  // Una corrida anterior que fallara deja avisos pendientes que esta tanda
  // recogería, falseando las cuentas. La bandeja empieza vacía.
  await prisma.notification.deleteMany({ where: { status: { in: ['PENDIENTE', 'FALLIDA'] } } })
})

afterAll(async () => {
  await prisma.volunteer.deleteMany({ where: { email: { contains: marca } } })
  await prisma.collaborator.deleteMany({ where: { email: { contains: marca } } })
  await prisma.supportRequest.deleteMany({ where: { name: { contains: marca } } })
  // Los avisos a coordinación no llevan la marca de la corrida en su clave,
  // así que se borran por destinatario: si no, se van acumulando y la tanda
  // siguiente arrastra los de la anterior.
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { dedupeKey: { contains: marca } },
        { toEmail: { contains: marca } },
        { toEmail: 'coordinacion@ejemplo.com' },
      ],
    },
  })
  await new Promise((resolver) => servidor.close(resolver))
  await prisma.$disconnect()
})

/**
 * Espera a que llegue un correo que cumpla el predicado.
 *
 * El servidor de mentira guarda lo que recibe dentro de callbacks asíncronos,
 * así que despachar y mirar la lista en la línea siguiente es una carrera.
 * Esto no esconde fallos: si el correo no llega nunca, la prueba falla igual,
 * solo que medio segundo después.
 */
async function esperarCorreo(cumple, ms = 1500) {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    const encontrado = recibidos.find(cumple)
    if (encontrado) return encontrado
    await new Promise((r) => setTimeout(r, 25))
  }
  return undefined
}

function postulacion(sufijo, extra = {}) {
  return {
    fullName: `Ana Prueba ${sufijo}`,
    phone: '3145558899',
    email: `${sufijo}.${marca}@ejemplo.com`,
    city: 'Ibagué',
    profession: 'Psicología',
    yearsExperience: 'MENOS_DE_1',
    professionalCard: 'SI',
    populations: ['Adultos'],
    crisisExperience: 'SI',
    modality: 'VIRTUAL',
    availableDays: ['LUNES'],
    availableSlots: ['TARDE'],
    weeklyHours: 'ENTRE_1_Y_3',
    consentVersion: '2026-08',
    dataConsent: true,
    ...extra,
  }
}

describe('avisos por correo', () => {
  it('el formulario responde sin esperar al correo', async () => {
    const res = await request(app).post('/api/volunteers').send(postulacion('encola'))

    expect(res.status).toBe(201)

    // Al responder, el aviso está encolado pero todavía no enviado.
    const pendientes = await prisma.notification.count({
      where: { toEmail: { contains: `encola.${marca}` }, status: 'PENDIENTE' },
    })
    expect(pendientes).toBe(1)
    expect(recibidos).toHaveLength(0)
  })

  it('el despachador los envía y llegan a quien tienen que llegar', async () => {
    await despachar()

    const acuse = await esperarCorreo((c) => c.para.includes(`encola.${marca}`))
    const interno = await esperarCorreo((c) => c.para.includes('coordinacion@ejemplo.com'))

    expect(acuse).toBeTruthy()
    expect(acuse.asunto).toBe('Recibimos tu postulación')
    expect(acuse.texto).toContain('Gracias por sumarte, Ana')

    expect(interno).toBeTruthy()
    expect(interno.texto).toContain('Ana Prueba encola')
    // Los enlaces de los avisos apuntan al sitio real, no a localhost.
    expect(interno.html).toContain('https://redaquiestamos.org/portal/postulaciones')
  })

  it('no manda el mismo aviso dos veces', async () => {
    const mios = () => recibidos.filter((c) => c.para.includes(marca)).length
    const antes = mios()
    await despachar()
    await new Promise((r) => setTimeout(r, 300))
    expect(mios()).toBe(antes)
  })

  it('un aviso de solicitud no dice quién pidió ayuda', async () => {
    recibidos.length = 0

    const enviado = await request(app)
      .post('/api/support-requests')
      .send({
        forWhom: 'PARA_MI',
        isMinor: false,
        name: `Persona ${marca}`,
        phone: '3009998877',
        preferredContact: 'WHATSAPP',
        city: 'Ibagué',
        preferredModality: 'VIRTUAL',
        availableDays: ['LUNES'],
        availableSlots: ['TARDE'],
        consentVersion: '2026-08',
        dataConsent: true,
        sensitiveDataConsent: true,
      })

    expect(enviado.status, JSON.stringify(enviado.body)).toBe(201)

    await despachar()

    const aviso = await esperarCorreo((c) => c.asunto.includes('solicitud'))
    expect(aviso).toBeTruthy()
    expect(aviso.texto).not.toContain(marca)
    expect(aviso.texto).not.toContain('3009998877')
  })

  it('si el proveedor falla, el aviso se reintenta en vez de perderse', async () => {
    rechazarTodo = true

    await request(app).post('/api/volunteers').send(postulacion('falla'))
    await despachar()

    const aviso = await prisma.notification.findFirst({
      where: { toEmail: { contains: `falla.${marca}` } },
    })

    expect(aviso.status).toBe('PENDIENTE')
    expect(aviso.attempts).toBe(1)
    expect(aviso.lastError).toBeTruthy()
    // Se reprograma hacia adelante: reintentar de inmediato solo gasta cuota.
    expect(aviso.sendAfter.getTime()).toBeGreaterThan(Date.now())

    rechazarTodo = false
  })

  it('un aviso reprogramado no se intenta antes de tiempo', async () => {
    await despachar()
    // Se espera de más a propósito: si fuera a salir, aquí habría salido.
    expect(await esperarCorreo((c) => c.para.includes(`falla.${marca}`), 400)).toBeUndefined()
  })

  it('cuando le llega el turno, sale', async () => {
    await prisma.notification.updateMany({
      where: { toEmail: { contains: `falla.${marca}` } },
      data: { sendAfter: new Date(Date.now() - 1000) },
    })

    await despachar()

    expect(await esperarCorreo((c) => c.para.includes(`falla.${marca}`))).toBeTruthy()

    const aviso = await prisma.notification.findFirst({
      where: { toEmail: { contains: `falla.${marca}` } },
    })
    expect(aviso.status).toBe('ENVIADA')
    expect(aviso.sentAt).toBeTruthy()
  })
})
