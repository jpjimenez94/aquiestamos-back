import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { generarToken, hashearToken, fechaExpiracion } from '../src/auth/session.js'
import { PERMISOS } from '../src/auth/permissions.js'

const app = createApp()
const MARCA = `plantillas-${Date.now()}`

/**
 * Los textos de los mensajes salen de Parametrización.
 *
 * Había dos verdades sobre lo que se le dice a una persona: las 15 plantillas
 * que la coordinación edita en el portal, y los textos escritos a mano en
 * `lib/mensajes.ts`. Ganaba siempre el código, así que editar un mensaje en la
 * pantalla, verlo guardado y que no cambiara nada era el comportamiento
 * normal.
 *
 * Este endpoint es lo que conecta las dos. Lo que se prueba aquí es que el
 * portal pueda LEERLO —incluido el AGENDADOR, que es quien manda los mensajes
 * y no tiene `configuracion:leer`— y que no se lleve de paso los parámetros
 * del sistema.
 */

let sesiones = []
let usuarios = []

/**
 * Nunca se crea un usuario ADMIN aquí.
 *
 * `correosDeCoordinacion()` le manda los avisos internos a TODAS las cuentas
 * ADMIN activas de la base. Un ADMIN de prueba se cuela como destinatario y
 * descuadra los conteos de `avisos.flow`, que corre en paralelo. Para leer las
 * plantillas basta con haber iniciado sesión, así que LECTURA sirve igual.
 */
let contador = 0

async function sesionPara(role) {
  // Un correo por llamada: varias pruebas piden el mismo rol y el correo es
  // único en la base.
  contador += 1
  const usuario = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}.${contador}.${MARCA}@pruebas.local`,
      name: `Prueba ${role}`,
      role,
      roles: [role],
      passwordHash: 'no-importa',
      active: true,
    },
  })
  usuarios.push(usuario.id)

  const token = generarToken()
  const s = await prisma.session.create({
    data: { userId: usuario.id, tokenHash: hashearToken(token), expiresAt: fechaExpiracion(1) },
  })
  sesiones.push(s.id)
  return token
}

beforeAll(async () => {
  // Que el catálogo exista en la base de pruebas.
  await request(app).get('/api/health')
})

afterAll(async () => {
  await prisma.session.deleteMany({ where: { id: { in: sesiones } } })
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } })
})

describe('las plantillas llegan a quien manda los mensajes', () => {
  it('sin sesión no se ven', async () => {
    const res = await request(app).get('/api/settings/plantillas')
    expect(res.status).toBe(401)
  })

  it('el AGENDADOR las ve, aunque no tenga configuracion:leer', async () => {
    // Este es el punto entero. El AGENDADOR es quien escribe a la gente todo
    // el día, y `GET /api/settings` le da 403.
    expect(PERMISOS.AGENDADOR).not.toContain('configuracion:leer')

    const token = await sesionPara('AGENDADOR')
    const res = await request(app)
      .get('/api/settings/plantillas')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data).length).toBeGreaterThan(0)
  })

  it('el endpoint de configuración sí le sigue negado', async () => {
    const token = await sesionPara('AGENDADOR')
    const res = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('trae los mensajes, no los parámetros del sistema', async () => {
    const token = await sesionPara('LECTURA')
    const res = await request(app)
      .get('/api/settings/plantillas')
      .set('Authorization', `Bearer ${token}`)

    const claves = Object.keys(res.body.data)
    expect(claves).toContain('WHATSAPP_CUADRAR_HORARIO_PERSONA')
    expect(claves).toContain('WHATSAPP_PROPUESTA_PROFESIONAL')

    // Nada de duraciones, dominios ni teléfonos de soporte: eso es
    // configuración, y para eso está el otro endpoint.
    expect(claves).not.toContain('DURACION_CITA_MINUTOS')
    expect(claves).not.toContain('DOMINIO_JITSI')
    expect(claves).not.toContain('SITIO_WEB_URL')
  })

  it('devuelve texto, no el objeto entero de configuración', async () => {
    const token = await sesionPara('LECTURA')
    const res = await request(app)
      .get('/api/settings/plantillas')
      .set('Authorization', `Bearer ${token}`)

    for (const valor of Object.values(res.body.data)) {
      expect(typeof valor).toBe('string')
    }
  })

  it('lo que se edita es lo que se devuelve', async () => {
    const token = await sesionPara('LECTURA')
    const clave = 'WHATSAPP_CUADRAR_HORARIO_PERSONA'
    const original = (await prisma.systemSetting.findUnique({ where: { key: clave } }))?.value

    await prisma.systemSetting.update({
      where: { key: clave },
      data: { value: `TEXTO EDITADO ${MARCA}` },
    })

    const res = await request(app)
      .get('/api/settings/plantillas')
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.data[clave]).toBe(`TEXTO EDITADO ${MARCA}`)

    await prisma.systemSetting.update({ where: { key: clave }, data: { value: original } })
  })
})
