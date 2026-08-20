import { SessionModel } from '../models/session.model.js'
import { hashearToken, tokenDePeticion } from '../auth/session.js'
import { failure } from '../views/response.view.js'

/**
 * Verifica la sesión y deja al usuario en `req.usuario`.
 * Comprueba, en este orden: que haya token, que la sesión exista, que no esté
 * revocada, que no haya caducado, y que la cuenta siga activa y sin borrar.
 */
export async function authenticate(req, res, next) {
  try {
    const token = tokenDePeticion(req)
    if (!token) {
      return res.status(401).json(failure('Necesitas iniciar sesión'))
    }

    const sesion = await SessionModel.findByTokenHash(hashearToken(token))
    if (!sesion || sesion.revokedAt || sesion.expiresAt <= new Date()) {
      return res.status(401).json(failure('Tu sesión expiró. Vuelve a iniciar sesión'))
    }

    const { user } = sesion
    if (!user || !user.active || user.deletedAt) {
      return res.status(401).json(failure('Esta cuenta ya no tiene acceso'))
    }

    req.usuario = user
    req.sesion = sesion
    next()
  } catch (error) {
    next(error)
  }
}
