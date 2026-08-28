/**
 * El nombre de pila, en un solo sitio.
 *
 * Esta función parece tonta y no lo es: su trabajo es decidir cuánto se sabe
 * de una persona en las pantallas que no piden sesión. La sala de espera, el
 * formulario de experiencia, el consentimiento y la subida de documentos
 * saludan por el nombre, y saludar con el nombre completo de alguien que está
 * recibiendo atención psicológica es más de lo que hace falta para saludar.
 *
 * Estaba escrita seis veces —`pila` en cinco controladores y `primerNombre` en
 * otro— y ya no coincidían: unas devolvían `null` para un nombre vacío y otra
 * devolvía `''`. Que la regla de cuánto se enseña de una persona esté copiada
 * seis veces significa que endurecerla en un sitio no la endurece en los otros
 * cinco.
 *
 * Devuelve `null` y no `''` a propósito: quien lo use tiene que decidir qué
 * hacer cuando no hay nombre, en vez de pintar una cadena vacía sin enterarse.
 */
export function primerNombre(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] || null
}
