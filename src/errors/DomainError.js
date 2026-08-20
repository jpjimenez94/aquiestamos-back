/**
 * Error de negocio con código estable.
 *
 * El manejador de errores lo traduce a HTTP en un solo sitio, y el frontend
 * puede reaccionar al código sin depender del texto del mensaje.
 */
export class DomainError extends Error {
  constructor(codigo, mensaje, detalles) {
    super(mensaje)
    this.name = 'DomainError'
    this.codigo = codigo
    this.detalles = detalles
  }
}

/** Qué código HTTP le corresponde a cada situación. */
export const ESTADOS_HTTP = {
  // 409 — el mundo cambió mientras la persona decidía
  FRANJA_OCUPADA: 409,
  PACIENTE_OCUPADO: 409,
  YA_TIENE_PROFESIONAL: 409,

  // 422 — la petición es coherente pero rompe una regla
  DURACION_INSUFICIENTE: 422,
  FUERA_DE_FRANJA: 422,
  BLOQUEO_DE_AGENDA: 422,
  TRANSICION_INVALIDA: 422,
  SIN_CUPO: 422,
  PROFESIONAL_NO_ACTIVO: 422,
  RANGO_INVALIDO: 422,
  RANGO_DEMASIADO_LARGO: 422,
  EN_EL_PASADO: 422,

  // 404
  NO_ENCONTRADO: 404,
}

export function estadoDe(codigo) {
  return ESTADOS_HTTP[codigo] ?? 400
}
