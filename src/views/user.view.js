import { permisosDe } from '../auth/permissions.js'

/**
 * VISTA: User
 * El hash de la clave no sale de aquí en ningún caso.
 */
export function usuarioPublico(user) {
  const roles = Array.isArray(user.roles) && user.roles.length > 0
    ? user.roles
    : (user.role ? [user.role] : [])

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? roles[0] ?? 'AGENDADOR',
    roles,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }
}

export function usuarioLista(usuarios) {
  return usuarios.map(usuarioPublico)
}

/** Lo que necesita el portal justo después de iniciar sesión. */
export function sesionIniciada(user, token, expiresAt) {
  const roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : (user.role ? [user.role] : [])
  return {
    token,
    expiresAt,
    usuario: { ...usuarioPublico(user), permisos: permisosDe(roles) },
  }
}

export function perfil(user) {
  const roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : (user.role ? [user.role] : [])
  return { ...usuarioPublico(user), permisos: permisosDe(roles) }
}
