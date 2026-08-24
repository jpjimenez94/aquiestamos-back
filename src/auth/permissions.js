/**
 * Matriz de permisos del portal.
 *
 * Este archivo es el ÚNICO sitio donde se decide qué puede hacer cada rol.
 * En los controladores nunca debe aparecer `if (usuario.role === 'ADMIN')`:
 * si la regla se reparte, añadir un rol obliga a revisar todo el backend.
 */

/**
 * Permisos por rol. `*` significa «todo».
 *
 * Permisos exclusivos de ADMIN (cubiertos por `*`):
 *   - solicitud:eliminar  → borrado lógico de una solicitud de acompañamiento
 */
export const PERMISOS = {
  ADMIN: ['*'],

  // Voluntario digital: recibe lo que llega, lo aprueba y lo agenda.
  //
  // Puede APROBAR postulaciones (profesional:crear) y ADMITIR solicitudes con
  // su prioridad (paciente:crear): es quien opera la entrada, y sin eso cada
  // aprobación tenía que esperar a la administración.
  //
  // SÍ ve las fichas de los profesionales y verifica sus tarjetas. Antes no:
  // se consideraban datos maestros. Resultó que en la operación real es este
  // rol quien lleva el WhatsApp con cada profesional y quien le pide y sube el
  // soporte de su tarjeta, así que negárselo solo conseguía que tuviera que
  // pedirle a la administración que hiciera clic por él.
  //
  // Lo que sigue sin poder: `profesional:editar` —cupo de casos, notas
  // internas, enlazar una cuenta del portal— y `profesional:borrar`. Verificar
  // una tarjeta tiene permiso propio justo para no tener que abrir todo eso.
  // Las notas internas tampoco le llegan: la vista solo se las da a ADMIN.
  AGENDADOR: [
    'postulacion:leer',
    'solicitud:leer',
    'paciente:leer',
    'paciente:crear',
    'profesional:crear',
    'profesional:leer',
    'profesional:verificar-tarjeta',
    'agenda:leer',
    'disponibilidad:leer',
    'asignacion:crear',
    'asignacion:cerrar',
    'cita:crear',
    'cita:reprogramar',
    'cita:cancelar',
    'cita:confirmar',
    'cita:cerrar',
    // El consentimiento firmado de una cita lo sube y lo mira quien agenda.
    // No le abre las tarjetas profesionales: para llegar a una haría falta su
    // clave, y esa solo aparece en fichas de profesional, que este rol no ve.
    'documento:subir',
    'documento:leer',
  ],

  // Solo lectura: visibilidad global, ninguna acción. Todos sus permisos
  // terminan en :leer a propósito; si alguna vez aparece aquí uno de escribir,
  // el rol dejó de ser lo que su nombre promete.
  LECTURA: [
    'postulacion:leer',
    'solicitud:leer',
    'colaborador:leer',
    'profesional:leer',
    'paciente:leer',
    'agenda:leer',
    'disponibilidad:leer',
    'usuario:leer',
    'auditoria:leer',
    'documento:leer',
    // Las métricas de impacto: para leer, no para operar. El AGENDADOR no
    // las tiene a propósito — pedido explícito: solo administración y lectura.
    'metricas:leer',
  ],

  // Profesional de la red: su agenda y sus propias franjas de disponibilidad.
  PROFESIONAL: [
    'agenda:leer:propia',
    'disponibilidad:leer:propia',
    'disponibilidad:editar:propia',
  ],
}

/** Todo el que haya iniciado sesión puede ver y cambiar lo suyo. */
const PERMISOS_COMUNES = ['perfil:leer:propio', 'perfil:cambiar-clave']

export function puede(usuario, permiso) {
  if (!usuario || !usuario.role) return false
  if (PERMISOS_COMUNES.includes(permiso)) return true

  const concedidos = PERMISOS[usuario.role]
  if (!concedidos) return false

  return concedidos.some((p) => p === '*' || p === permiso)
}

/** Lista expandida de permisos de un rol, para mostrarla en el portal. */
export function permisosDe(role) {
  const concedidos = PERMISOS[role] ?? []
  if (concedidos.includes('*')) return ['*']
  return [...concedidos, ...PERMISOS_COMUNES]
}

export const ROLES = Object.keys(PERMISOS)
