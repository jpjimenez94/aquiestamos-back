import { describe, it, expect } from 'vitest'
import {
  esClaveDeAlmacenamiento,
  CARPETAS,
  TIPOS_ACEPTADOS,
  TAMANO_MAXIMO,
  guardarDocumento,
} from '../src/almacenamiento/documentos.js'
import { puede } from '../src/auth/permissions.js'

/**
 * Los documentos que sube el equipo son tarjetas profesionales y certificados:
 * documentos de identidad de personas reales. Antes vivían en
 * `front/public/uploads/`, que Next sirve al mundo entero sin pedir sesión y
 * que el repositorio versionaba. Estas pruebas fijan lo que impide volver ahí.
 */

describe('validación al guardar un documento', () => {
  const bytes = Buffer.from('contenido de prueba')

  it('rechaza una carpeta que no está en la lista', async () => {
    await expect(
      guardarDocumento({ carpeta: 'otra', tipo: 'image/png', bytes }),
    ).rejects.toThrow()
  })

  /**
   * La carpeta viaja en la petición. Sin lista cerrada, un `../../` en ese
   * campo escribe donde quiera.
   */
  it('no deja escapar de las carpetas con rutas relativas', async () => {
    for (const carpeta of ['../secretos', 'tarjetas/../..', '/etc', '']) {
      await expect(
        guardarDocumento({ carpeta, tipo: 'image/png', bytes }),
      ).rejects.toThrow()
    }
  })

  it('solo acepta PDF e imágenes', async () => {
    for (const tipo of ['text/html', 'application/javascript', 'image/svg+xml', '']) {
      await expect(
        guardarDocumento({ carpeta: 'tarjetas', tipo, bytes }),
      ).rejects.toThrow()
    }
  })

  it('rechaza un archivo vacío', async () => {
    await expect(
      guardarDocumento({ carpeta: 'tarjetas', tipo: 'image/png', bytes: Buffer.alloc(0) }),
    ).rejects.toThrow()
  })

  it('rechaza lo que pase del tamaño máximo', async () => {
    const enorme = Buffer.alloc(TAMANO_MAXIMO + 1)
    await expect(
      guardarDocumento({ carpeta: 'tarjetas', tipo: 'image/png', bytes: enorme }),
    ).rejects.toThrow()
  })

  it('las carpetas y los tipos son listas cerradas', () => {
    expect(CARPETAS).toEqual(['tarjetas', 'consentimientos', 'documentos'])
    expect(Object.keys(TIPOS_ACEPTADOS)).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
    // SVG queda fuera a propósito: es XML y puede llevar scripts dentro.
    expect(TIPOS_ACEPTADOS['image/svg+xml']).toBeUndefined()
  })
})

describe('claves nuevas contra rutas viejas', () => {
  it('reconoce una clave del almacenamiento', () => {
    expect(esClaveDeAlmacenamiento('tarjetas/abc-123.jpg')).toBe(true)
    expect(esClaveDeAlmacenamiento('consentimientos/x.pdf')).toBe(true)
  })

  /**
   * Los registros anteriores guardan `/uploads/tarjetas/x.jpeg` o un enlace de
   * Drive. Distinguirlos permite que el portal los siga mostrando sin intentar
   * firmarlos contra un bucket donde no están.
   */
  it('no confunde una ruta vieja ni un enlace externo con una clave', () => {
    expect(esClaveDeAlmacenamiento('/uploads/tarjetas/x.jpeg')).toBe(false)
    expect(esClaveDeAlmacenamiento('https://drive.google.com/file/d/abc')).toBe(false)
    expect(esClaveDeAlmacenamiento('otra/cosa.jpg')).toBe(false)
    expect(esClaveDeAlmacenamiento('')).toBe(false)
    expect(esClaveDeAlmacenamiento(null)).toBe(false)
  })
})

describe('quién puede tocar los documentos', () => {
  it('un profesional no puede ni subirlos ni verlos', () => {
    expect(puede({ role: 'PROFESIONAL' }, 'documento:leer')).toBe(false)
    expect(puede({ role: 'PROFESIONAL' }, 'documento:subir')).toBe(false)
  })

  it('solo lectura los ve pero no los sube', () => {
    expect(puede({ role: 'LECTURA' }, 'documento:leer')).toBe(true)
    expect(puede({ role: 'LECTURA' }, 'documento:subir')).toBe(false)
  })

  it('quien agenda los necesita para el consentimiento firmado', () => {
    expect(puede({ role: 'AGENDADOR' }, 'documento:leer')).toBe(true)
    expect(puede({ role: 'AGENDADOR' }, 'documento:subir')).toBe(true)
  })

  it('sin sesión, nada', () => {
    expect(puede(null, 'documento:leer')).toBe(false)
  })
})
