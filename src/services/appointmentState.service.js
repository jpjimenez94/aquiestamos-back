import { DomainError } from '../errors/DomainError.js'

/**
 * Máquina de estados de la cita, en un solo sitio.
 *
 * Si cada pantalla validara sus propias transiciones, tarde o temprano una se
 * saltaría y quedaría una cita cancelada marcada como realizada.
 */

export const ESTADOS = {
  PROGRAMADA: 'PROGRAMADA',
  CONFIRMADA: 'CONFIRMADA',
  REALIZADA: 'REALIZADA',
  CANCELADA: 'CANCELADA',
  NO_ASISTIO: 'NO_ASISTIO',
  REPROGRAMADA: 'REPROGRAMADA',
}

/** Estados que ocupan sitio en la agenda. Coincide con el WHERE del constraint. */
export const OCUPAN_AGENDA = [ESTADOS.PROGRAMADA, ESTADOS.CONFIRMADA]

/** Estados finales: de aquí no se sale. */
export const FINALES = [
  ESTADOS.REALIZADA,
  ESTADOS.CANCELADA,
  ESTADOS.NO_ASISTIO,
  ESTADOS.REPROGRAMADA,
]

const TRANSICIONES = {
  /**
   * NO_ASISTIO también sale de aquí, y no salía.
   *
   * Una cita puede llegar a su hora sin haber pasado por CONFIRMADA —la
   * confirmación la da la persona, y no siempre la da— y que aun así no se
   * presente nadie. Sin esta transición eso no se podía registrar: había que
   * cancelarla, que dice otra cosa, o confirmarla primero para poder marcar la
   * ausencia, que es escribir en la base algo que no pasó.
   *
   * No es un detalle de etiqueta: «no asistió» es de los pocos datos que dicen
   * cómo va un acompañamiento, y se estaba perdiendo justo en las citas que
   * nadie confirmó, que son las que más se caen.
   */
  PROGRAMADA: [
    ESTADOS.CONFIRMADA,
    ESTADOS.CANCELADA,
    ESTADOS.REPROGRAMADA,
    ESTADOS.REALIZADA,
    ESTADOS.NO_ASISTIO,
  ],
  CONFIRMADA: [ESTADOS.REALIZADA, ESTADOS.NO_ASISTIO, ESTADOS.CANCELADA, ESTADOS.REPROGRAMADA],
  REALIZADA: [],
  CANCELADA: [],
  NO_ASISTIO: [],
  REPROGRAMADA: [],
}

/** Etiquetas para mostrar. El enum se queda en mayúsculas dentro del sistema. */
export const ETIQUETAS = {
  PROGRAMADA: 'Programada',
  CONFIRMADA: 'Confirmada',
  REALIZADA: 'Realizada',
  CANCELADA: 'Cancelada',
  NO_ASISTIO: 'No asistió',
  REPROGRAMADA: 'Reprogramada',
}

export function transicionesDesde(estado) {
  return TRANSICIONES[estado] ?? []
}

export function puedeTransicionar(desde, hacia) {
  return transicionesDesde(desde).includes(hacia)
}

/** Lanza si la transición no está permitida. Devuelve el estado nuevo si sí. */
export function exigirTransicion(desde, hacia) {
  if (desde === hacia) {
    throw new DomainError('TRANSICION_INVALIDA', `La cita ya está ${ETIQUETAS[hacia] ?? hacia}`, {
      actual: desde,
    })
  }

  if (!puedeTransicionar(desde, hacia)) {
    const permitidas = transicionesDesde(desde)
    const texto = permitidas.length
      ? `Desde ${ETIQUETAS[desde]} solo se puede pasar a: ${permitidas.map((e) => ETIQUETAS[e]).join(', ')}`
      : `Una cita ${ETIQUETAS[desde]} ya no se puede cambiar`

    throw new DomainError('TRANSICION_INVALIDA', texto, { actual: desde, permitidas })
  }

  return hacia
}

/**
 * Si esta sesión ocurrió de verdad.
 *
 * REALIZADA no lo dice: es una casilla que alguien tiene que acordarse de
 * marcar en el portal. Medir la sesión por ella era medir la memoria de quien
 * coordina, no el acompañamiento — y el informe salía diciendo «0 sesiones»
 * con la telemetría enseñando doce llamadas al lado.
 *
 * Que las dos personas entraran a la sala es prueba, no indicio: nadie abre
 * esa puerta por accidente, y para abrirla hace falta el enlace firmado de
 * cada rol. Vale tanto como la casilla, y no depende de que nadie se acuerde.
 *
 * Al revés no vale: NO_ASISTIO y CANCELADA mandan sobre la telemetría. Que
 * alguien asomara la cabeza a la sala no convierte en sesión lo que quien
 * estuvo ahí dice que no lo fue.
 */
/** «Ya la acompañé»: el profesional dice que la sesión ocurrió. */
export const REPORTE_CONFIRMA = 'YA_ATENDIDA'
/** «Teníamos sesión y no se presentó»: dice que no ocurrió. */
export const REPORTE_NIEGA = 'NO_ASISTIO'

/**
 * El reporte con el que el profesional cerró ESTA sesión.
 *
 * Los reportes cuelgan de la asignación, no de la cita, así que hay que
 * emparejarlos: el que cierra una sesión es el primero que se escribió
 * después de que empezara. Con dos sesiones en el mismo caso, a cada una le
 * toca el suyo.
 */
export function reporteDeLaCita(cita, reportes, citasDelCaso = []) {
  if (!cita?.caseAssignmentId || !reportes?.length) return null
  const empezo = new Date(cita.startsAt).getTime()

  /**
   * Dónde termina «esta sesión»: cuando empieza la siguiente del mismo caso.
   *
   * Sin esto, un reporte tardío se lo quedaban TODAS las sesiones anteriores
   * a la vez. Pasó en producción: Estivalys escribió el 2 de septiembre a las
   * 7:56 p. m. «se reprograma la cita de hoy», y el portal se lo colgó
   * también a la sesión del 29 de agosto —que quedó dada por cerrada con un
   * reporte de otra fecha, sin contar como sesión y sin salir en «Lo que
   * está esperando»—.
   *
   * Un reporte cierra la sesión más reciente que ya había empezado cuando se
   * escribió, y solo esa.
   *
   * Sin `citasDelCaso` no hay forma de saber si hubo una sesión después, así
   * que se trata como si esta fuera la última: es lo mismo que hacía antes.
   * Quien llame debe pasar las citas que tenga a mano —se filtran aquí por
   * asignación, así que vale de sobra pasar todas—.
   */
  let siguiente = Infinity
  for (const c of citasDelCaso) {
    if (c.caseAssignmentId !== cita.caseAssignmentId) continue
    const cuando = new Date(c.startsAt).getTime()
    if (cuando > empezo && cuando < siguiente) siguiente = cuando
  }

  const suyos = reportes
    .filter((r) => {
      if (r.assignmentId !== cita.caseAssignmentId) return false
      const cuando = new Date(r.createdAt).getTime()
      return cuando >= empezo && cuando < siguiente
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  return suyos[0] ?? null
}

/**
 * Si esta sesión ocurrió, en orden de quién lo sabe mejor.
 *
 *   1. El profesional que estuvo ahí. Su reporte es la respuesta, no un
 *      indicio: nadie más puede saberlo mejor, y vale en las dos direcciones
 *      —«ya la acompañé» y «teníamos sesión y no se presentó»—.
 *   2. La casilla que marca coordinación (REALIZADA / NO_ASISTIO).
 *   3. Que las dos personas entraran a la sala.
 *
 * El tercero es el más débil y va el último a propósito: depende de que la
 * pestaña de la sala siguiera abierta. Si alguien cerró la pestaña, si se fue
 * la señal, si entraron desde el móvil y la app pasó a segundo plano, el
 * rastro se queda corto o no llega. Sirve para no perder sesiones que
 * ocurrieron y nadie cerró; no para contradecir a quien estuvo ahí.
 *
 * Medirlo solo por REALIZADA era medir la memoria de quien coordina: el
 * informe decía «0 sesiones» con la telemetría enseñando doce llamadas al
 * lado.
 */
export function huboSesion(cita, reportes = [], citasDelCaso = []) {
  if (!cita) return false

  const dijoElProfesional = reporteDeLaCita(cita, reportes, citasDelCaso)?.outcome ?? null
  if (dijoElProfesional === REPORTE_CONFIRMA) return true
  if (dijoElProfesional === REPORTE_NIEGA) return false

  if (cita.status === ESTADOS.NO_ASISTIO || cita.status === ESTADOS.CANCELADA) return false
  if (cita.status === ESTADOS.REALIZADA) return true

  return cita.patientFirstJoinedAt != null && cita.professionalFirstJoinedAt != null
}

/**
 * Sesiones que ya pasaron y nadie cerró: ni marcadas, ni con rastro de sala.
 *
 * No son ausencias ni sesiones: son deuda operativa. Contarlas como «no
 * ocurrió» hunde las tasas; contarlas como «ocurrió» las infla. Se cuentan
 * aparte, que es lo único honesto, y de paso le dice a quien coordina cuántos
 * cierres tiene pendientes.
 */
export function esperandoCierre(cita, reportes = [], ahora = Date.now(), citasDelCaso = []) {
  if (!cita) return false
  if (esFinal(cita.status)) return false
  if (reporteDeLaCita(cita, reportes, citasDelCaso)) return false
  if (huboSesion(cita, reportes, citasDelCaso)) return false
  return new Date(cita.startsAt).getTime() <= ahora
}

export function ocupaAgenda(estado) {
  return OCUPAN_AGENDA.includes(estado)
}

export function esFinal(estado) {
  return FINALES.includes(estado)
}
