import { permisosDe } from '../auth/permissions.js'

/**
 * VISTA: User
 * El hash de la clave no sale de aquí en ningún caso.
 */
export function usuarioPublico(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
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
  return {
    token,
    expiresAt,
    usuario: { ...usuarioPublico(user), permisos: permisosDe(user.role) },
  }
}

export function perfil(user) {
  return { ...usuarioPublico(user), permisos: permisosDe(user.role) }
}
