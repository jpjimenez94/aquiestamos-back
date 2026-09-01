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
  PROGRAMADA: [ESTADOS.CONFIRMADA, ESTADOS.CANCELADA, ESTADOS.REPROGRAMADA, ESTADOS.REALIZADA],
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
function reporteDeLaCita(cita, reportes) {
  if (!cita.caseAssignmentId || !reportes?.length) return null
  const empezo = new Date(cita.startsAt).getTime()
  const suyos = reportes
    .filter(
      (r) =>
        r.assignmentId === cita.caseAssignmentId && new Date(r.createdAt).getTime() >= empezo,
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  return suyos[0]?.outcome ?? null
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
export function huboSesion(cita, reportes = []) {
  if (!cita) return false

  const dijoElProfesional = reporteDeLaCita(cita, reportes)
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
export function esperandoCierre(cita, reportes = [], ahora = Date.now()) {
  if (!cita) return false
  if (esFinal(cita.status)) return false
  if (reporteDeLaCita(cita, reportes)) return false
  if (huboSesion(cita, reportes)) return false
  return new Date(cita.startsAt).getTime() <= ahora
}

export function ocupaAgenda(estado) {
  return OCUPAN_AGENDA.includes(estado)
}

export function esFinal(estado) {
  return FINALES.includes(estado)
}
