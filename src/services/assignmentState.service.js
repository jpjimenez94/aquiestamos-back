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
  /**
   * De ACEPTADA se sale agendando, declinando o cancelando.
   *
   * RECHAZADA tuvo que entrar aquí cuando asignar dejó de ser pedir permiso.
   * Antes el profesional declinaba desde PROPUESTA, que era su primera parada;
   * ahora nace en ACEPTADA y esa puerta se había quedado en un estado por el
   * que ya no pasa nadie. El mensaje que le llega le dice «si no puedes, dilo
   * ahí mismo» — y no había ahí mismo.
   *
   * No es un detalle de estados: asignar sin preguntar solo es justo si decir
   * que no sigue siendo un toque. Sin esta transición, lo que se quitó no fue
   * un paso, fue su capacidad de negarse.
   *
   * Declinar es distinto de cancelar y por eso son dos salidas. RECHAZADA dice
   * «este profesional no podía» y el caso vuelve a la cola para otro; CANCELADA
   * dice «no se pudo cuadrar», que suele ser cosa de horarios y no de él. Que
   * en los cierres se distingan es lo único que permite saber si se está
   * asignando mal.
   */
  ACEPTADA: [ESTADOS.ACTIVA, ESTADOS.RECHAZADA, ESTADOS.CANCELADA],
  ACTIVA: [ESTADOS.CERRADA, ESTADOS.CANCELADA],
  RECHAZADA: [],
  CANCELADA: [],
  CERRADA: [],
}

/**
 * ACEPTADA es ahora la puerta de entrada, no el segundo paso.
 *
 * Una asignación nace ahí: al profesional se le asigna el caso y se le avisa,
 * en vez de pedirle permiso y quedarse esperando. Puede declinar desde su
 * enlace —eso lo lleva a RECHAZADA— pero mientras no diga nada, el caso
 * avanza. Antes el silencio lo detenía, y así se perdieron siete de cada ocho.
 *
 * PROPUESTA se queda por las asignaciones que nacieron antes del cambio.
 * Ninguna nueva pasa por ahí.
 */
export const ETIQUETAS = {
  PROPUESTA: 'Propuesta enviada (asignación antigua)',
  ACEPTADA: 'Asignado, falta que elija hora',
  ACTIVA: 'En acompañamiento',
  RECHAZADA: 'El profesional no pudo',
  CANCELADA: 'No se pudo cuadrar',
  CERRADA: 'Cerrada',
}

/** Qué le toca hacer a quien coordina cuando ve este estado. */
export const SIGUIENTE_PASO = {
  PROPUESTA: 'Esperando que el profesional entre a su enlace y responda.',
  // Dos cosas, y en este orden: él tiene que saber que lo tiene antes de que
  // ella agende sobre su agenda. El aviso al profesional es además el único
  // sitio por el que le llega su enlace, que es por donde declina si no puede.
  ACEPTADA: 'Avísale al profesional que tiene el caso y mándale a la persona su enlace de agenda.',
  ACTIVA: 'Ya hay cita. Haz seguimiento cuando pase.',
  RECHAZADA: 'Asígnale otro profesional.',
  CANCELADA: 'Asígnale otro profesional.',
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
