import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

const app = createApp()

/**
 * Que cada puerta pública responda, aunque le den una llave mala.
 *
 * Esta prueba existe por un fallo que me metí yo. Al unificar la función del
 * nombre de pila, una expresión regular se llevó por delante `citaDelToken` en
 * el controlador de consentimiento. La función seguía llamándose en dos sitios
 * y ya no existía: los dos endpoints del consentimiento habrían reventado con
 * un ReferenceError. La suite entera —398 pruebas— pasó en verde.
 *
 * Pasó porque ninguna prueba llegaba a ejecutar el cuerpo de esos
 * controladores. Se probaba la capa de tokens por debajo y el flujo completo
 * por arriba, pero nadie tocaba la puerta.
 *
 * Esto lo hace: le da una llave inválida a cada puerta pública y comprueba que
 * conteste como debe. No valida reglas de negocio; valida que el código de esa
 * ruta se ejecuta de principio a fin. Es barato y atrapa justo la clase de
 * error que un refactor introduce sin querer.
 *
 * Un 500 aquí significa que el controlador se rompió al entrar. Un 404 o un
 * 422 significan que llegó hasta donde tenía que llegar y rechazó la llave.
 */

const LLAVE_MALA = 'esto-no-es-un-token-valido'

const puertas = [
  ['tamizaje', 'get', `/api/triage/${LLAVE_MALA}`],
  ['consentimiento', 'get', `/api/consentimiento/${LLAVE_MALA}`],
  ['encuesta de cierre', 'get', `/api/encuesta/${LLAVE_MALA}`],
  ['experiencia', 'get', `/api/experiencia/${LLAVE_MALA}`],
  ['documentos del profesional', 'get', `/api/documentos-profesional/${LLAVE_MALA}`],
  ['sala: información', 'get', `/api/meetings/${LLAVE_MALA}/info`],
  ['turno de voluntariado', 'get', `/api/turno-confirmacion/${LLAVE_MALA}`],
  ['recursos', 'get', '/api/resources'],
  ['salud', 'get', '/api/health'],
]

describe('las puertas públicas responden sin reventar', () => {
  for (const [nombre, metodo, ruta] of puertas) {
    it(`${nombre} contesta a una llave inválida sin caerse`, async () => {
      const res = await request(app)[metodo](ruta)

      // Lo que importa: que NO sea un 5xx. Un 500 aquí es el controlador
      // rompiéndose antes de poder decidir nada.
      expect(res.status, `${ruta} devolvió ${res.status}`).toBeLessThan(500)
    })
  }

  it('responden JSON, no una página de error', async () => {
    for (const [, metodo, ruta] of puertas) {
      const res = await request(app)[metodo](ruta)
      expect(res.headers['content-type']).toMatch(/json/)
    }
  })
})

describe('las puertas privadas piden sesión', () => {
  // El otro lado de lo mismo: que ninguna de estas conteste sin credenciales.
  const privadas = [
    ['sesiones en vivo', '/api/meetings/live'],
    ['personas', '/api/patients'],
    ['profesionales', '/api/professionals'],
    ['agenda', '/api/appointments'],
    ['tablero', '/api/dashboard'],
    ['métricas', '/api/dashboard/metricas'],
    ['usuarios', '/api/users'],
    ['auditoría', '/api/audit'],
    ['configuración', '/api/settings'],
    ['tareas', '/api/tasks'],
    ['líderes', '/api/leaders'],
    ['colaboradores', '/api/collaborators'],
    ['solicitudes', '/api/support-requests'],
    ['postulaciones', '/api/volunteers'],
  ]

  for (const [nombre, ruta] of privadas) {
    it(`${nombre} responde 401 sin sesión`, async () => {
      const res = await request(app).get(ruta)
      expect(res.status, `${ruta} devolvió ${res.status}`).toBe(401)
    })
  }
})
