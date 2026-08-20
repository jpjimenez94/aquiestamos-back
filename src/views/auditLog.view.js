/**
 * VISTA: AuditLog
 */
export function entradaAuditoria(entrada) {
  return {
    id: entrada.id,
    actor: entrada.actorEmail,
    accion: entrada.action,
    entidad: entrada.entity,
    entidadId: entrada.entityId,
    antes: entrada.before,
    despues: entrada.after,
    ip: entrada.ip,
    fecha: entrada.createdAt,
  }
}

export function listaAuditoria(entradas) {
  return entradas.map(entradaAuditoria)
}
