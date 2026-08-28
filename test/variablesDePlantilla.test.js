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
 * Los de WhatsApp llegan de verdad al mensaje; los de correo todavía no.
 *
 * Las ocho plantillas de correo se sirven al portal, se editan y se guardan,
 * pero quien manda los correos —`notifications/plantillas.js`— no las lee: el
 * texto sale del código. Se comprobó buscando quién las consume y no las
 * consume nadie.
 *
 * Conectarlas no es cablearlas: sus textos y los del código llevan tiempo
 * separados sin que nadie lo notara. El asunto del acuse de postulación es
 * «Recibimos tu postulación» en el código y «Recibimos tu postulación · Red
 * Aquí Estamos» en el portal, y el saludo es por nombre de pila en uno y con
 * apellido en el otro. Enchufarlas hoy cambiaría en silencio el asunto y el
 * saludo de todos los correos que salen.
 *
 * Mientras eso no se decida, sus variables declaradas describen lo que se
 * PODRÁ usar, no lo que el texto usa: por eso solo se les exige la otra
 * dirección, que es la que sí engaña a quien edita.
 */
const LLEGAN_AL_MENSAJE = PLANTILLAS.filter((p) => p.category === 'MENSAJE_WHATSAPP')

/** Las variables que de verdad aparecen escritas en el texto. */
function usadasEn(texto) {
  return new Set([...String(texto).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

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
