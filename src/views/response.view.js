/**
 * VISTA base: da forma uniforme a toda respuesta JSON de la API.
 * El frontend (Next.js) es la otra mitad de la capa de vista.
 */
export function ok(data, meta) {
  return meta ? { success: true, data, meta } : { success: true, data }
}

export function created(data, message) {
  return { success: true, message, data }
}

export function failure(message, details) {
  return details ? { success: false, message, details } : { success: false, message }
}
