import { describe, it, expect } from 'vitest'
import { SettingsService, DEFAULT_SETTINGS } from '../src/services/settings.service.js'

describe('SettingsService · Parametrización y Plantillas', () => {
  it('contiene todas las plantillas predeterminadas de WhatsApp, Correo y Parámetros', () => {
    expect(DEFAULT_SETTINGS.length).toBeGreaterThanOrEqual(25)
    
    const whatsapp = DEFAULT_SETTINGS.filter(s => s.category === 'MENSAJE_WHATSAPP')
    const correos = DEFAULT_SETTINGS.filter(s => s.category === 'PLANTILLA_CORREO')
    const params = DEFAULT_SETTINGS.filter(s => s.category === 'PARAMETRO_GENERAL')

    expect(whatsapp.length).toBeGreaterThanOrEqual(13)
    expect(correos.length).toBeGreaterThanOrEqual(8)
    expect(params.length).toBeGreaterThanOrEqual(8)
  })

  it('interpola variables correctamente en una plantilla', () => {
    const template = 'Hola {nombre}, tu sesión con {profesional} es el {cuando}. Enlace: {enlace}'
    const data = {
      nombre: 'María',
      profesional: 'Dr. Jean Franco',
      cuando: '28/08/2026, 9:00 a. m.',
      enlace: 'https://www.redaquiestamos.org/sala/abc',
    }

    const resultado = SettingsService.interpolate(template, data)
    expect(resultado).toBe('Hola María, tu sesión con Dr. Jean Franco es el 28/08/2026, 9:00 a. m.. Enlace: https://www.redaquiestamos.org/sala/abc')
  })

  it('mantiene la variable si no se suministra en los datos', () => {
    const template = 'Hola {nombre}, tu código es {codigo}'
    const resultado = SettingsService.interpolate(template, { nombre: 'Carlos' })
    expect(resultado).toBe('Hola Carlos, tu código es {codigo}')
  })
})

/**
 * Cada clave vive en una de las TRES categorías que la pantalla conoce.
 *
 * `WHATSAPP_CUIDADO_OFRECER` salió con una categoría inventada
 * —`PLANTILLA_WHATSAPP`— y Parametrización agrupa por las tres que conoce: la
 * clave existía, se guardaba, se usaba… y no se podía editar desde ninguna
 * pestaña. Nadie la vio hasta que Byron la fue a buscar.
 */
describe('las categorías son las que la pantalla sabe pintar', () => {
  const CONOCIDAS = ['MENSAJE_WHATSAPP', 'PLANTILLA_CORREO', 'PARAMETRO_GENERAL']

  it('ninguna clave se queda fuera de las tres pestañas', () => {
    const huerfanas = DEFAULT_SETTINGS.filter((s) => !CONOCIDAS.includes(s.category)).map(
      (s) => `${s.key} (${s.category})`,
    )
    expect(huerfanas).toEqual([])
  })
})
