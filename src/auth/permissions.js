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
 *   - solicitud:eliminar     → borrado lógico de una solicitud de acompañamiento
 *   - solicitud:editar       → corregir los datos de contacto de una solicitud
 *                              (nombre, teléfono, correo, ciudad…). No incluye
 *                              las autorizaciones: esas son el registro de lo
 *                              que la persona aceptó, no un campo editable.
 *   - postulacion:eliminar   → borrado lógico de una postulación de voluntariado
 *   - dato-sensible:ver      → el tamizaje pregunta por pregunta, y la ficha
 *                              completa de persona, profesional y solicitud.
 *                              Es lo más delicado que guarda el sistema: ahí
 *                              está si alguien dijo tener pensamientos de
 *                              hacerse daño.
 *   - disponibilidad:editar  → tocar la agenda de CUALQUIER profesional. El
 *                              profesional edita la suya con
 *                              `disponibilidad:editar:propia`.
 */
export const PERMISOS = {
  ADMIN: ['*'],

  // Voluntario digital general: recibe lo que llega, lo aprueba y lo agenda.
  AGENDADOR: [
    // Cuidado del equipo: ver quién pidió el espacio y convocar la sesión grupal.
    'cuidado:leer',
    'cuidado:gestionar',
    'postulacion:leer',
    'solicitud:leer',
    'colaborador:leer',
    'colaborador:editar',
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
    'tarea:leer',
    'tarea:crear',
    'tarea:editar',
    'tarea:asignar',
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
  ],

  // Gestión de Casos y Agenda: solo gestiona el tablero de agenda, citas y personas acompañadas.
  COORDINADOR_CASOS: [
    'cuidado:leer',
    'cuidado:gestionar',
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
    'tarea:leer',
    'configuracion:leer',
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
    'cuidado:leer',
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
    'tarea:leer',
    'configuracion:leer',
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

/**
 * Los roles de una cuenta, resueltos en un solo sitio.
 *
 * Un usuario tiene DOS campos de rol: `roles[]`, que es el bueno, y `role`,
 * que es el que había antes de que una cuenta pudiera tener varios. Los dos
 * siguen en la base y hoy dicen lo mismo, pero nada obliga a que lo sigan
 * diciendo: se pueden guardar `role: 'ADMIN'` y `roles: ['LECTURA']` a la vez.
 *
 * Diez sitios del backend leían `usuario.role` a mano mientras `puede()` leía
 * `roles[]`. Con eso, una cuenta creada así resultaba de solo lectura para los
 * permisos y de administrador para las vistas: no podía hacer nada, pero veía
 * el tamizaje completo de todo el mundo, con la pregunta de si la persona ha
 * tenido pensamientos de hacerse daño incluida.
 *
 * Por eso esta función existe y por eso es la única que debe mirar esos
 * campos. Si vuelve a aparecer un `usuario.role ===` en un controlador o en
 * una vista, la divergencia vuelve con él.
 */
export function rolesDe(usuario) {
  if (!usuario) return []
  if (Array.isArray(usuario.roles) && usuario.roles.length > 0) return usuario.roles
  return usuario.role ? [usuario.role] : []
}

/**
 * ¿Esta cuenta tiene este rol?
 *
 * Para preguntas sobre la cuenta en sí —«¿es administrador?», «¿es una cuenta
 * de profesional?»—. Para preguntas sobre lo que alguien PUEDE hacer, la
 * respuesta es `puede()`, que es la que respeta la matriz.
 */
export function tieneRol(usuario, rol) {
  return rolesDe(usuario).includes(rol)
}

export function puede(usuario, permiso) {
  if (!usuario) return false
  if (PERMISOS_COMUNES.includes(permiso)) return true

  const listaRoles = rolesDe(usuario)
  if (listaRoles.length === 0) return false

  return listaRoles.some((rol) => {
    const concedidos = PERMISOS[rol]
    if (!concedidos) return false
    return concedidos.some((p) => p === '*' || p === permiso)
  })
}

/** Lista expandida de permisos de uno o varios roles, para mostrarla en el portal. */
export function permisosDe(rolesOrRole) {
  const listaRoles = Array.isArray(rolesOrRole)
    ? rolesOrRole.filter(Boolean)
    : [rolesOrRole].filter(Boolean)

  if (listaRoles.length === 0) return [...PERMISOS_COMUNES]

  const todos = new Set(PERMISOS_COMUNES)
  for (const rol of listaRoles) {
    const concedidos = PERMISOS[rol] ?? []
    if (concedidos.includes('*')) return ['*']
    for (const p of concedidos) todos.add(p)
  }
  return Array.from(todos)
}

export const ROLES = Object.keys(PERMISOS)
