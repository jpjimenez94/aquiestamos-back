/**
 * SERVICIO: de las respuestas del tamizaje a una prioridad.
 *
 * Estas reglas son las mismas que el portal le muestra a quien admite. Viven
 * aquí, en un solo sitio, porque si se afinan y la explicación se queda escrita
 * en otro lado, el portal empieza a decir una cosa y el sistema a hacer otra.
 *
 * El orden importa: se evalúan primero las señales de ALTA y se sale. Una
 * señal de ALTA no se compensa con cinco de BAJA.
 *
 * Lo que sale de aquí es una SUGERENCIA. La decide una persona: el botón de
 * admitir sigue pidiendo que alguien elija, solo que ahora llega con la
 * respuesta puesta y el motivo a la vista.
 */

/** Señales que mandan el caso a ALTA por sí solas. */
function senalesDeAlta(r) {
  const razones = []

  // Va primero a propósito: es la única respuesta que basta sola.
  if (r.selfHarmThoughts) {
    razones.push('Dijo que ha tenido pensamientos de hacerse daño o de no querer seguir')
  }
  if (!r.safePlace) {
    razones.push('No está en un lugar seguro o le falta lo básico')
  }
  if (r.distress === 5) {
    razones.push('Dice que la está pasando lo peor posible (5 de 5)')
  }
  if (r.distress === 4 && r.dailyFunction === 'NO') {
    razones.push('Intensidad 4 de 5 y no puede con sus cosas del día')
  }
  if (r.howSoon === 'HOY') {
    razones.push('Necesita hablar con alguien hoy')
  }

  return razones
}

/** Señales que, sin nada de lo anterior, dejan el caso en MEDIA. */
function senalesDeMedia(r) {
  const razones = []

  if (r.distress >= 3) razones.push(`Dice que la está pasando mal: ${r.distress} de 5`)
  if (r.sleepAndEat !== 'SI') razones.push('No está durmiendo ni comiendo bien')
  if (r.dailyFunction === 'CON_DIFICULTAD') {
    razones.push('Va con dificultad con sus cosas del día')
  }
  if (r.howSoon === 'ESTA_SEMANA') razones.push('Necesita hablar con alguien esta semana')
  if (!r.hasSupport) razones.push('No tiene a nadie cerca que la acompañe')

  return razones
}

export function calcularPrioridad(respuestas, { esMenor = false } = {}) {
  const altas = senalesDeAlta(respuestas)
  if (altas.length > 0) {
    return { prioridad: 'ALTA', razones: altas }
  }

  const medias = senalesDeMedia(respuestas)
  if (medias.length > 0) {
    // En un menor de edad, MEDIA sube a ALTA: no puede gestionar su propia
    // espera y quien responde por él puede no estar viendo lo mismo.
    if (esMenor) {
      return { prioridad: 'ALTA', razones: [...medias, 'Es menor de edad, así que MEDIA sube a ALTA'] }
    }
    return { prioridad: 'MEDIA', razones: medias }
  }

  return {
    prioridad: 'BAJA',
    razones: ['Está en un lugar seguro, duerme, come, puede con el día y tiene con quién'],
  }
}

/** Si esto es cierto, alguien tiene que enterarse ya, no cuando abra el portal. */
export function exigeAvisoInmediato(respuestas) {
  return respuestas.selfHarmThoughts === true || respuestas.safePlace === false
}
