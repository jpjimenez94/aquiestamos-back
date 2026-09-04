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

/**
 * El payload tiene que ser EL DE PRODUCCIÓN, no uno que quede bonito.
 *
 * Aquí estuvo el agujero. Este fixture traía `accion: 'aceptó'`,
 * `resultado: 'Ya la acompañé'` y `modalidad: 'virtual'` —valores ya
 * redactados— justo en los tres campos donde los dos caminos se separaban: el
 * código ramificaba con `p.accion === 'ACEPTADO'`, traducía el enum del
 * resultado y bajaba la modalidad a minúscula; la plantilla del portal no sabe
 * hacer nada de eso y sustituye tal cual.
 *
 * Con valores ya humanizados la comparación byte a byte cuadraba siempre: la
 * traducción no encontraba clave y caía en el propio valor, `.toLowerCase()` no
 * cambiaba nada, y `'aceptó' === 'ACEPTADO'` era falso en los dos caminos por
 * igual. La prueba estaba verde mientras el correo real salía diciendo
 * «ACEPTADO» en el asunto y «❌ No puede en este momento» en el cuerpo.
 *
 * Regla para quien añada un campo: escribe aquí exactamente lo que le pasa
 * `eventos.js`. Si eso hace fallar la comparación, el fallo es del correo.
 */
const PAYLOAD = {
  nombre: 'Ana Ruiz',
  profesional: 'Sofía Vélez',
  nombreVoluntario: 'Camilo Pérez',
  cuando: 'lunes, 31 de agosto, 9:00 a. m.',
  // `citaAgendada` la baja a minúscula antes de encolar.
  modalidad: 'virtual',
  ruta: '/portal/caso/abc',
  // `reporteRecibido` traduce los enums con las tablas de `catalogos.js`.
  resultado: 'Ya la acompane',
  queSigue: 'Necesita más sesiones',
  dificultades: 'ninguna',
  titulo: 'Apoyo en la jornada',
  descripcion: 'Acompañar la jornada del sábado',
  nota: 'Llevar carné',
  fechaLimite: '30 de agosto',
  // `tareaRespondida` manda el enum crudo Y las dos formas ya redactadas.
  accion: 'ACEPTADO',
  accionLegible: 'Aceptó',
  respuesta: '✅ Aceptó apoyar',
  motivoRechazo: '',
  disciplina: 'Trabajo social',

  /**
   * Lo que va ya redactado porque una plantilla plana no sabe hacerlo.
   *
   * Cada campo de aquí abajo existe por la misma razón: el código traducía,
   * formateaba o ramificaba, y el portal solo sustituye. Se decide en el
   * evento y viaja hecho, para que los dos caminos digan lo mismo.
   */
  cuandoLargo: 'lunes, 31 de agosto, 9:00 a. m.',
  modalidadLegible: 'virtual',
  // Sin ciudad, el codigo pinta «Ciudad: undefined» y el portal se come la
  // linea entera: la comparacion cazaba una diferencia que era del fixture.
  ciudad: 'Ibagué',
  profesion: 'Psicología',
  dias: 5,
  enlace: 'https://x.test/consentimiento/abc',
  motivo: 'Se le cruzó un viaje',
  avisoMenor: '<strong>Es menor de edad.</strong>',
  explicacion:
    'Nadie agendó la sesión con <strong>Sofía Vélez</strong> a tiempo, así que el sistema liberó el caso. Puede que ella no eligiera hora, o que él nunca recibiera el aviso.',
  enlaceNueva: 'https://x.test/portal/personas/nueva',
  enlaceExistente: 'https://x.test/portal/personas/existente',
  asuntoAdmitida: 'Persona admitida · prioridad media',
  avisoSinRespuesta: null,
  prioridadLegible: 'Media',
  agenda: 'lunes de 8:00 a. m. a 12:00 p. m.',
  desdeCuando: 'lunes, 3 de marzo, 9:00 a. m.',
  completionUrl: 'https://x.test/entrega/abc',
  completionNote: 'Quedó todo listo',
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
  /**
   * Eran ocho de veintisiete. Las otras diecinueve se podían editar en el
   * portal —o ni eso— y el correo salía igual, con el texto del código.
   *
   * Quedan fuera solo `COORD_ERROR`, que es una alerta técnica de servidor y no
   * un mensaje a una persona: no tiene sentido que coordinación reescriba el
   * informe de un fallo.
   *
   * El número sube cuando se añade un correo, y subirlo a ciegas es saltarse
   * la comprobación: al añadir uno hay que dejarlo editable en Parametrización
   * en el mismo commit, que es lo que este número protege.
   */
  it('todas menos la alerta técnica tienen su equivalente en Parametrización', () => {
    expect(PAREJAS).toHaveLength(27)
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
