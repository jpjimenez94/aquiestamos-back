import { DomainError } from '../errors/DomainError.js'

/**
 * Máquina de estados de la asignación, en un solo sitio.
 *
 * Asignar era un clic y un hecho consumado: se elegía profesional y el caso
 * quedaba ACTIVA. En la realidad de la red no es un hecho, es una negociación
 * a tres bandas —voluntario, profesional, persona acompañada— que puede
 * fallar en cada tramo: el profesional puede no poder, el horario puede no
 * servirle a la persona, cualquiera de los dos puede no contestar.
 *
 * Antes ese estado intermedio vivía en la cabeza de quien coordinaba y en su
 * historial de WhatsApp. Si esa persona se enfermaba, nadie sabía en qué iba
 * cada caso, y el tablero decía "asignado" cuando nadie había aceptado nada.
 *
 *   PROPUESTA ──acepta──▶ ACEPTADA ──la persona elige horario──▶ ACTIVA ──▶ CERRADA
 *       │                     │
 *   no puede              no cuadra
 *       ▼                     ▼
 *   RECHAZADA             CANCELADA
 */

export const ESTADOS = {
  PROPUESTA: 'PROPUESTA',
  ACEPTADA: 'ACEPTADA',
  ACTIVA: 'ACTIVA',
  RECHAZADA: 'RECHAZADA',
  CANCELADA: 'CANCELADA',
  CERRADA: 'CERRADA',
}

/**
 * Estados en los que la negociación sigue abierta.
 *
 * Es la lista que usan tres cosas a la vez, y por eso vive aquí: el índice
 * único que impide proponerle dos profesionales a la vez a la misma persona,
 * el cupo de casos del profesional, y el enlace del caso compartido.
 *
 * Que una PROPUESTA cuente para el cupo es deliberado: si no, se le puede
 * proponer el mismo profesional a diez personas a la vez y todas "caben".
 */
export const VIVOS = [ESTADOS.PROPUESTA, ESTADOS.ACEPTADA, ESTADOS.ACTIVA]

/** De aquí no se sale. Para volver a intentarlo se propone otra asignación. */
export const FINALES = [ESTADOS.RECHAZADA, ESTADOS.CANCELADA, ESTADOS.CERRADA]

const TRANSICIONES = {
  PROPUESTA: [ESTADOS.ACEPTADA, ESTADOS.RECHAZADA, ESTADOS.CANCELADA],
  // De ACEPTADA se sale agendando (ACTIVA) o cancelando: si la persona no
  // responde o ningún horario le sirve, el caso vuelve a la cola.
  ACEPTADA: [ESTADOS.ACTIVA, ESTADOS.CANCELADA],
  ACTIVA: [ESTADOS.CERRADA, ESTADOS.CANCELADA],
  RECHAZADA: [],
  CANCELADA: [],
  CERRADA: [],
}

export const ETIQUETAS = {
  PROPUESTA: 'Propuesta enviada',
  ACEPTADA: 'Aceptada, falta cuadrar horario',
  ACTIVA: 'En acompañamiento',
  RECHAZADA: 'El profesional no pudo',
  CANCELADA: 'No se pudo cuadrar',
  CERRADA: 'Cerrada',
}

/** Qué le toca hacer a quien coordina cuando ve este estado. */
export const SIGUIENTE_PASO = {
  PROPUESTA: 'Esperando que el profesional entre a su enlace y responda.',
  ACEPTADA: 'Escríbele a la persona con los horarios que ofreció y cuadra uno.',
  ACTIVA: 'Ya hay cita. Haz seguimiento cuando pase.',
  RECHAZADA: 'Proponle el caso a otro profesional.',
  CANCELADA: 'Proponle el caso a otro profesional.',
  CERRADA: 'Nada: el acompañamiento terminó.',
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
    throw new DomainError('TRANSICION_INVALIDA', `La asignación ya está en «${ETIQUETAS[hacia] ?? hacia}»`, {
      actual: desde,
    })
  }

  if (!puedeTransicionar(desde, hacia)) {
    const permitidas = transicionesDesde(desde)
    const texto = permitidas.length
      ? `Desde «${ETIQUETAS[desde]}» solo se puede pasar a: ${permitidas.map((e) => ETIQUETAS[e]).join(', ')}`
      : `Una asignación en «${ETIQUETAS[desde]}» ya no se puede cambiar`

    throw new DomainError('TRANSICION_INVALIDA', texto, { actual: desde, permitidas })
  }

  return hacia
}

export function estaVivo(estado) {
  return VIVOS.includes(estado)
}

export function esFinal(estado) {
  return FINALES.includes(estado)
}
