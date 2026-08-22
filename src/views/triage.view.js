import { ETIQUETAS_PRIORIDAD } from '../catalogos.js'

/**
 * VISTA: TriageResponse
 *
 * Lo que quien admite necesita para decidir: qué prioridad salió, por qué, y
 * cuándo lo respondió. Las respuestas pregunta por pregunta NO van aquí: la
 * razón ya dice lo que hay que saber para actuar, y esto es dato de salud.
 */
export function tamizajeResumen(t) {
  if (!t) return null
  return {
    id: t.id,
    prioridadSugerida: t.suggestedPriority,
    prioridadLegible: ETIQUETAS_PRIORIDAD[t.suggestedPriority] ?? t.suggestedPriority,
    razones: t.reasons,
    respondidoEn: t.createdAt,
  }
}

/** Lo que ve un administrador: además, lo que respondió en cada pregunta. */
export function tamizajeCompleto(t) {
  if (!t) return null
  return {
    ...tamizajeResumen(t),
    respuestas: {
      safePlace: t.safePlace,
      distress: t.distress,
      sleepAndEat: t.sleepAndEat,
      dailyFunction: t.dailyFunction,
      hasSupport: t.hasSupport,
      selfHarmThoughts: t.selfHarmThoughts,
      howSoon: t.howSoon,
    },
    consentVersion: t.consentVersion,
  }
}

export function tamizajeSegunRol(t, usuario) {
  return usuario?.role === 'ADMIN' ? tamizajeCompleto(t) : tamizajeResumen(t)
}

/**
 * Lo que devuelve la puerta pública del tamizaje.
 *
 * Es la respuesta más restringida de todo el backend: la ruta no pide sesión
 * ni correo, solo el token. Sale el nombre de pila y nada más — ni apellido,
 * ni teléfono, ni ciudad. Quien tenga el enlace no puede sacar de aquí un dato
 * que no supiera ya.
 */
export function tamizajeParaLaPersona(solicitud, ultima) {
  return {
    nombre: String(solicitud.name ?? '').trim().split(/\s+/)[0] || '',
    yaRespondido: Boolean(ultima),
    respondidoEn: ultima?.createdAt ?? null,
  }
}
