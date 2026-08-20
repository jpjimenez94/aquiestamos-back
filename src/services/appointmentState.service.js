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

export function ocupaAgenda(estado) {
  return OCUPAN_AGENDA.includes(estado)
}

export function esFinal(estado) {
  return FINALES.includes(estado)
}
