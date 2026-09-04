import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/services/settings.service.js'

/**
 * Que las variables que anuncia el portal sean las que el texto usa.
 *
 * La pantalla de Parametrización le enseña a quien edita la lista de variables
 * disponibles: «puedes usar {nombre}, {profesional}, {enlace}». Esa lista y el
 * texto se escriben a mano y por separado, así que se separan solas.
 *
 * Cuando pasa, falla en silencio y hacia los dos lados. Si se anuncia una que
 * el texto no usa, alguien la mete confiando en la lista y le sale un
 * «{horarios}» literal en el WhatsApp de una persona que pidió ayuda. Si el
 * texto usa una que no se anuncia, quien edita no sabe que existe y la borra
 * sin querer al reescribir el mensaje.
 *
 * Ya pasó: la plantilla del enlace de agenda seguía anunciando `horarios`
 * después de que ese dato dejara de existir, y el mensaje salía con el
 * encabezado «Estos son los horarios en los que puede atenderte:» seguido de
 * nada.
 */

const PLANTILLAS = DEFAULT_SETTINGS.filter(
  (s) => s.category === 'MENSAJE_WHATSAPP' || s.category === 'PLANTILLA_CORREO',
)

/**
 * Por qué a los correos solo se les exige una de las dos direcciones.
 *
 * Este bloque decía que las plantillas de correo «no las lee nadie: el texto
 * sale del código», y sobre esa premisa relajaba la comprobación. Dejó de ser
 * cierto cuando `notifications/plantillaEditable.js` las conectó: hoy las ocho
 * salen del portal, igual que los WhatsApp. La premisa caducó y la relajación
 * se quedó, aplicada justo a las plantillas que ahora sí se envían.
 *
 * La relajación sigue, pero por otro motivo y acotado: en los correos hay
 * variables que el TEXTO no usa porque las consume el código —`ruta` arma la
 * URL del botón, que no se edita desde una pantalla—, así que exigir «todo lo
 * anunciado aparece escrito» daría falsos positivos. La otra dirección —«nada
 * usa lo que no se anuncia»— sí se les exige, abajo, junto con los WhatsApp:
 * esa es la que engaña a quien edita.
 */
const LLEGAN_AL_MENSAJE = PLANTILLAS.filter((p) => p.category === 'MENSAJE_WHATSAPP')

/** Las variables que de verdad aparecen escritas en el texto. */
function usadasEn(texto) {
  return new Set([...String(texto).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

/**
 * Un requisito legal no se afirma con texto fijo.
 *
 * El despacho al profesional llevaba escrita la línea «Consentimiento
 * informado: Firmado por la persona», sin variable, en la plantilla del
 * portal. El código sí miraba el dato y avisaba cuando faltaba — pero la
 * plantilla manda, así que lo que salía era la afirmación, firmara ella o no.
 *
 * El profesional lee que ya está, no lo pide, y la sesión ocurre sin
 * consentimiento registrado. Es peor que no decir nada, y no lo caza ninguna
 * prueba de las de arriba: como frase fija, es texto válido.
 *
 * La regla es la que faltaba: si una plantilla habla del consentimiento, tiene
 * que hacerlo con una variable, porque el hecho lo sabe el código y no la
 * pantalla.
 */
describe('lo que no puede ir escrito fijo', () => {
  const HABLAN_DEL_CONSENTIMIENTO = PLANTILLAS.flatMap((p) =>
    String(p.defaultValue)
      .split('\n')
      .filter((linea) => /consentimiento/i.test(linea))
      .map((linea) => [p.key, linea.trim()]),
  )

  it('alguna plantilla lo menciona, o esta prueba no está mirando nada', () => {
    expect(HABLAN_DEL_CONSENTIMIENTO.length).toBeGreaterThan(0)
  })

  it.each(HABLAN_DEL_CONSENTIMIENTO)(
    '%s · no da por firmado el consentimiento con texto fijo',
    (_clave, linea) => {
      // Una línea que solo invita a firmarlo no afirma nada; la que informa de
      // su estado sí, y esa tiene que calcularlo.
      const afirmaEstado = /firmad|sin firmar|todav[ií]a no/i.test(linea)
      if (!afirmaEstado) return
      expect(linea).toMatch(/\{\w+\}/)
    },
  )
})

describe('las variables de cada plantilla', () => {
  it('hay plantillas que revisar', () => {
    // Si el filtro deja de encontrarlas, este archivo pasaría en verde sin
    // comprobar nada, que es la peor forma de estar en verde.
    expect(PLANTILLAS.length).toBeGreaterThan(15)
  })

  it.each(LLEGAN_AL_MENSAJE.map((p) => [p.key, p]))(
    '%s · no anuncia variables que el texto no use',
    (_clave, plantilla) => {
      const usadas = usadasEn(plantilla.defaultValue)
      const sobran = (plantilla.variables ?? []).filter((v) => !usadas.has(v))
      expect(sobran).toEqual([])
    },
  )

  it.each(PLANTILLAS.map((p) => [p.key, p]))(
    '%s · no usa variables que no anuncie',
    (_clave, plantilla) => {
      const declaradas = new Set(plantilla.variables ?? [])
      const faltan = [...usadasEn(plantilla.defaultValue)].filter((v) => !declaradas.has(v))
      expect(faltan).toEqual([])
    },
  )
})
