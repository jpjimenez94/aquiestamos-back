import { describe, it, expect } from 'vitest'
import { construir } from '../src/notifications/plantillas.js'
import { PLANTILLA_DEL_PORTAL, rellenar, rellenarLinea } from '../src/notifications/plantillaEditable.js'
import { DEFAULT_SETTINGS } from '../src/services/settings.service.js'

/**
 * Que lo que se edita en Parametrización sea lo que se envía — también por correo.
 *
 * Las ocho plantillas de correo del portal no las leía nadie: se editaban, se
 * guardaban, y el correo salía con el texto del código. Mismo fallo que tenían
 * los mensajes de WhatsApp, y falla igual de callado.
 *
 * Conectarlas tenía un riesgo propio: los dos textos llevaban tiempo separados
 * sin que nadie lo notara. Enchufarlas tal cual habría cambiado en silencio el
 * asunto y el saludo de TODOS los correos que salen de la red, incluido el que
 * le dice a un profesional que tiene un caso.
 *
 * Por eso los textos del portal se generaron DESDE el código, y por eso esta
 * prueba compara los dos caminos byte a byte: conectar no puede cambiar ni una
 * coma de lo que sale hoy. El día que alguien edite una plantilla, cambiará
 * porque lo decidió — no porque un despliegue lo arrastrara.
 *
 * Cazó algo real: tres de los ocho perdían el bloque de datos —«Cuándo: …»,
 * «Modalidad: …»— porque el generador solo miraba título, párrafos y botón.
 */

const PAYLOAD = {
  nombre: 'Ana Ruiz',
  profesional: 'Sofía Vélez',
  nombreVoluntario: 'Camilo Pérez',
  cuando: 'lunes, 31 de agosto, 9:00 a. m.',
  modalidad: 'virtual',
  ruta: '/portal/caso/abc',
  resultado: 'Ya la acompañé',
  queSigue: 'Necesita otra sesión',
  dificultades: 'ninguna',
  titulo: 'Apoyo en la jornada',
  descripcion: 'Acompañar la jornada del sábado',
  nota: 'Llevar carné',
  fechaLimite: '30 de agosto',
  accion: 'aceptó',
  motivoRechazo: '',
  disciplina: 'Trabajo social',
}

/** Lo que el despachador arma con el texto guardado en el portal. */
function comoLoManda(claveDelPortal) {
  const def = DEFAULT_SETTINGS.find((d) => d.key === claveDelPortal)
  const t = JSON.parse(def.defaultValue)
  return {
    asunto: rellenar(t.asunto, PAYLOAD),
    titulo: t.titulo ? rellenar(t.titulo, PAYLOAD) : null,
    parrafos: (t.parrafos ?? []).map((x) => rellenarLinea(x, PAYLOAD)).filter(Boolean),
    datos: (t.datos ?? []).map((x) => rellenarLinea(x, PAYLOAD)).filter(Boolean),
    botonTexto: t.botonTexto ? rellenar(t.botonTexto, PAYLOAD) : null,
  }
}

const PAREJAS = Object.entries(PLANTILLA_DEL_PORTAL)

/**
 * El correo automático al profesional lleva el enlace de la sala.
 *
 * Salía solo, pero sin la sala: para que el profesional tuviera el enlace,
 * alguien tenía que acordarse de mandarle el «despacho» por WhatsApp. Un
 * mensaje manual entero para transportar un dato que el sistema ya tenía.
 */
describe('la cita agendada lleva la sala', () => {
  it('con sala, el correo la enlaza', () => {
    const r = construir('CITA_AGENDADA', { ...PAYLOAD, sala: 'https://x.test/sala/abc' })
    expect(r.contenido.datos.join('\n')).toContain('href="https://x.test/sala/abc"')
  })

  it('sin sala (presencial), no inventa una línea vacía', () => {
    const r = construir('CITA_AGENDADA', PAYLOAD)
    expect(r.contenido.datos.join('\n')).not.toMatch(/Sala virtual/)
  })
})

describe('los correos del portal salen igual que los del código', () => {
  it('las ocho plantillas tienen su equivalente en Parametrización', () => {
    expect(PAREJAS).toHaveLength(8)
    for (const [, claveDelPortal] of PAREJAS) {
      expect(DEFAULT_SETTINGS.find((d) => d.key === claveDelPortal)).toBeDefined()
    }
  })

  it.each(PAREJAS)('%s → %s · byte a byte', (claveAviso, claveDelPortal) => {
    const delCodigo = construir(claveAviso, PAYLOAD)
    const delPortal = construir(claveAviso, PAYLOAD, comoLoManda(claveDelPortal))

    expect(delPortal.asunto).toBe(delCodigo.asunto)
    expect(delPortal.texto).toBe(delCodigo.texto)
    expect(delPortal.html).toBe(delCodigo.html)
  })

  /**
   * Y si el texto del portal no sirve, sale el del código.
   *
   * Un JSON roto o una plantilla vacía no pueden dejar sin correo a quien está
   * esperando saber que le asignaron un acompañamiento.
   */
  it('sin texto del portal, el correo sale igual', () => {
    for (const [claveAviso] of PAREJAS) {
      const r = construir(claveAviso, PAYLOAD, null)
      expect(r.asunto.length).toBeGreaterThan(0)
      expect(r.texto.length).toBeGreaterThan(20)
    }
  })

  /** El enlace del botón lo calcula el código: no se edita desde una pantalla. */
  it('el botón conserva su URL aunque se reescriba el texto', () => {
    const conBoton = PAREJAS.find(([a]) => construir(a, PAYLOAD).contenido?.boton)
    expect(conBoton).toBeDefined()

    const [claveAviso, claveDelPortal] = conBoton
    const url = construir(claveAviso, PAYLOAD).contenido.boton.url
    const editado = { ...comoLoManda(claveDelPortal), botonTexto: 'Otro texto' }
    const r = construir(claveAviso, PAYLOAD, editado)

    expect(r.contenido.boton.url).toBe(url)
    expect(r.contenido.boton.texto).toBe('Otro texto')
  })
})
