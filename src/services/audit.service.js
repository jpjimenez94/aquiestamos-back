import { AuditLogModel } from '../models/auditLog.model.js'

/**
 * SERVICIO: auditoría.
 *
 * Registrar nunca debe tumbar la operación que se está auditando: si la
 * escritura del rastro falla, se avisa por consola y la petición sigue.
 */

/** Campos que jamás deben quedar copiados en el rastro. */
const CAMPOS_SENSIBLES = new Set(['passwordHash', 'password', 'clave', 'tokenHash', 'token'])

export function limpiar(objeto) {
  if (!objeto || typeof objeto !== 'object') return objeto
  const salida = {}
  for (const [clave, valor] of Object.entries(objeto)) {
    if (CAMPOS_SENSIBLES.has(clave)) continue
    salida[clave] = valor instanceof Date ? valor.toISOString() : valor
  }
  return salida
}

export async function registrar({ req, action, entity, entityId, before, after }) {
  try {
    const actor = req?.usuario ?? null
    await AuditLogModel.create({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      before: before ? limpiar(before) : undefined,
      after: after ? limpiar(after) : undefined,
      ip: req?.ip ?? null,
    })
  } catch (error) {
    console.error('[auditoria] no se pudo registrar:', action, entity, error.message)
  }
}

/** Acciones con nombre, para no escribir cadenas sueltas por ahí. */
export const ACCION = {
  ACCEDER: 'acceder',
  ACCESO_FALLIDO: 'acceso_fallido',
  SALIR: 'salir',
  CONSULTAR: 'consultar',
  CREAR: 'crear',
  EDITAR: 'editar',
  BORRAR: 'borrar',
  CAMBIAR_CLAVE: 'cambiar_clave',
}
