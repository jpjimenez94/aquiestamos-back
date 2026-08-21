/**
 * Matriz de permisos del portal.
 *
 * Este archivo es el ÚNICO sitio donde se decide qué puede hacer cada rol.
 * En los controladores nunca debe aparecer `if (usuario.role === 'ADMIN')`:
 * si la regla se reparte, añadir un rol obliga a revisar todo el backend.
 */

/** Permisos por rol. `*` significa «todo». */
export const PERMISOS = {
  ADMIN: ['*'],

  // Voluntario digital: consulta y agenda. No toca datos maestros ni usuarios.
  AGENDADOR: [
    'postulacion:leer',
    'solicitud:leer',
    'colaborador:leer',
    'profesional:leer',
    'paciente:leer',
    'agenda:leer',
    'disponibilidad:leer',
    'asignacion:crear',
    'asignacion:cerrar',
    'cita:crear',
    'cita:reprogramar',
    'cita:cancelar',
    'cita:confirmar',
    'cita:cerrar',
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
