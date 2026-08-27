import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { generarTokenSala, verificarTokenSala } from '../src/services/meeting.service.js'

const app = createApp()

/**
 * Quién puede ver qué en las salas de videollamada.
 *
 * `/api/meetings/live` estuvo abierto a internet. Devuelve el nombre completo
 * de la persona acompañada, el del profesional y el de cada participante
 * conectado: cualquiera que pidiera esa URL sabía, en tiempo real, quién
 * estaba en terapia y con quién. Se comprobó desde fuera, sin credenciales, y
 * respondía 200.
 *
 * Estas pruebas existen para que eso no pueda volver a pasar sin que algo se
 * ponga rojo. Lo que se afirma aquí no es «el código llama a authenticate»,
 * sino lo que de verdad importa: sin sesión no salen nombres.
 */
describe('quién puede ver las salas', () => {
  describe('el panel de supervisión es privado', () => {
    it('sin sesión, /meetings/live no responde', async () => {
      const res = await request(app).get('/api/meetings/live')
      expect(res.status).toBe(401)
    })

    it('sin sesión, /meetings/live no filtra un solo nombre', async () => {
      const res = await request(app).get('/api/meetings/live')
      const cuerpo = JSON.stringify(res.body)

      // La comprobación es sobre la forma de la respuesta, no sobre datos
      // concretos: si algún día el controlador devuelve otra cosa con nombres
      // dentro, esto sigue valiendo.
      expect(cuerpo).not.toMatch(/sesiones/i)
      expect(res.body?.data).toBeUndefined()
    })

    it('con un token inventado tampoco', async () => {
      const res = await request(app)
        .get('/api/meetings/live')
        .set('Authorization', 'Bearer esto-no-es-una-sesion')
      expect(res.status).toBe(401)
    })
  })

  describe('la sala sigue siendo pública, que para eso es una sala', () => {
    // Quien entra a una sala no tiene cuenta en el portal: solo un enlace. Si
    // esto empezara a pedir sesión, nadie podría entrar a su propia cita.
    it('pedir información de una sala no exige sesión', async () => {
      const res = await request(app).get('/api/meetings/llave-que-no-vale/info')
      // 404 porque la llave no vale, NO 401: la puerta está abierta, lo que
      // falla es la llave.
      expect(res.status).toBe(404)
    })
  })
})

/**
 * La llave de la sala.
 *
 * `generarTokenSala` existía pero no se llamaba desde ningún sitio: las vistas
 * emitían el uuid de la cita, así que la firma no protegía nada y el rol lo
 * elegía quien abría el enlace. Estas pruebas fijan las dos propiedades que
 * hacen que la llave sirva de algo.
 */
describe('la llave de la sala', () => {
  const cita = '11111111-2222-3333-4444-555555555555'

  it('lleva el rol sellado dentro', () => {
    expect(verificarTokenSala(generarTokenSala(cita, 'PACIENTE')).rol).toBe('PACIENTE')
    expect(verificarTokenSala(generarTokenSala(cita, 'PROFESIONAL')).rol).toBe('PROFESIONAL')
  })

  it('la del paciente no es la del profesional', () => {
    expect(generarTokenSala(cita, 'PACIENTE')).not.toBe(generarTokenSala(cita, 'PROFESIONAL'))
  })

  it('es estable: el enlace que se mandó por WhatsApp sigue valiendo mañana', () => {
    // Llevaba `Date.now()` dentro, así que cambiaba en cada render y el enlace
    // enviado dejaba de coincidir con el que veía la coordinación.
    expect(generarTokenSala(cita, 'PACIENTE')).toBe(generarTokenSala(cita, 'PACIENTE'))
  })

  it('si se manipula, no vale', () => {
    const bueno = generarTokenSala(cita, 'PACIENTE')
    expect(verificarTokenSala(bueno.slice(0, -3) + 'AAA')).toBeNull()
    expect(verificarTokenSala('cualquier-cosa')).toBeNull()
    expect(verificarTokenSala('')).toBeNull()
    expect(verificarTokenSala(null)).toBeNull()
  })

  it('no se puede forjar con el secreto que está publicado en GitHub', async () => {
    const crypto = await import('crypto')
    const payload = Buffer.from(
      JSON.stringify({ aid: cita, rol: 'PROFESIONAL' }),
    ).toString('base64url')
    const firmaVieja = crypto
      .createHmac('sha256', 'aqui-estamos-secret-key')
      .update(payload)
      .digest('base64url')

    expect(verificarTokenSala(`${payload}.${firmaVieja}`)).toBeNull()
  })
})
