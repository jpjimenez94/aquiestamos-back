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
 *   - solicitud:eliminar    → borrado lógico de una solicitud de acompañamiento
 *   - postulacion:eliminar  → borrado lógico de una postulación de voluntariado
 */
export const PERMISOS = {
  ADMIN: ['*'],

  // Voluntario digital general: recibe lo que llega, lo aprueba y lo agenda.
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
    'documento:subir',
    'documento:leer',
    'lideres:leer',
    'lideres:crear',
    'lideres:editar',
  ],

  // Admisión y Verificaciones: solo gestiona solicitudes, postulaciones y verificaciones de TP/cédula.
  ADMISION: [
    'postulacion:leer',
    'solicitud:leer',
    'paciente:crear',
    'profesional:crear',
    'profesional:leer',
    'profesional:verificar-tarjeta',
    'documento:subir',
    'documento:leer',
    'lideres:leer',
  ],

  // Gestión de Casos y Agenda: solo gestiona el tablero de agenda, citas y personas acompañadas.
  COORDINADOR_CASOS: [
    'paciente:leer',
    'paciente:editar',
    'profesional:leer',
    'agenda:leer',
    'disponibilidad:leer',
    'asignacion:crear',
    'asignacion:cerrar',
    'cita:crear',
    'cita:reprogramar',
    'cita:cancelar',
    'cita:confirmar',
    'cita:cerrar',
    'documento:subir',
    'documento:leer',
    'lideres:leer',
    'lideres:editar',
  ],

  // Operador de Líderes Comunitarios: acceso EXCLUSIVO a gestión de líderes y procesos de la red.
  LIDERES_COMUNITARIOS: [
    'lideres:leer',
    'lideres:crear',
    'lideres:editar',
    'lideres:inactivar',
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
    'lideres:leer',
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
