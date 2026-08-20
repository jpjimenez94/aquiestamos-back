/**
 * Versiones del texto de autorización de tratamiento de datos.
 *
 * Por qué existe este archivo: guardar `dataConsent: true` no sirve como prueba.
 * Si el texto cambia en noviembre, no hay forma de saber qué aceptó quien se
 * registró en agosto. Cada envío guarda la versión, y el texto de cada versión
 * queda congelado aquí y en el historial de git.
 *
 * Reglas:
 *   · Nunca edites el texto de una versión ya publicada. Crea una nueva.
 *   · Al crear una nueva, súbela a VERSION_ACTUAL y deja la anterior en la lista.
 */

export const VERSION_ACTUAL = '2026-08'

/** Versiones que el backend acepta. Las viejas siguen siendo válidas para los registros que ya existen. */
export const VERSIONES_VALIDAS = ['2026-08', '2026-08-google']

/**
 * Las 71 postulaciones que llegaron por el Google Form antes de que existiera
 * el formulario del sitio. Aceptaron este texto, que es el que se conserva:
 *
 *   "Autorizo el uso de los datos suministrados exclusivamente para
 *    contactarme en relacion con esta iniciativa de acompanamiento
 *    psicologico."
 *
 * Se marca aparte de la version 2026-08 para que quede claro que texto acepto
 * cada persona. No se edita nunca.
 */

/**
 * Responsable del tratamiento. Estos datos salen en la política pública.
 *
 * PENDIENTE: el NIT está en gestión y no hay dirección física ni correo
 * dedicado de habeas data. Mientras tanto, el canal para ejercer derechos es
 * el WhatsApp de la red, que es un medio válido. En cuanto exista un correo,
 * actualízalo aquí y publica una versión nueva del texto.
 */
export const RESPONSABLE = {
  nombre: 'Red Aquí Estamos',
  nit: null,
  direccion: null,
  canalHabeasData: 'WhatsApp +57 323 419 9846',
  correoHabeasData: null,
  urlPolitica: '/politica-de-datos',
  retencionMeses: 24,
}

export function esVersionValida(version) {
  return VERSIONES_VALIDAS.includes(version)
}
