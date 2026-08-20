import { UserModel } from '../models/user.model.js'
import { SessionModel } from '../models/session.model.js'
import {
  hashearClave,
  verificarClave,
  gastarTiempoEquivalente,
} from '../auth/password.js'
import { generarToken, hashearToken, fechaExpiracion } from '../auth/session.js'
import { env } from '../config/env.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, failure } from '../views/response.view.js'
import { sesionIniciada, perfil } from '../views/user.view.js'

const MAX_INTENTOS = 5
const BLOQUEO_MINUTOS = 15

export const AuthController = {
  /** POST /api/auth/login */
  async login(req, res, next) {
    try {
      const { email, password } = req.validated
      const usuario = await UserModel.findByEmail(email)

      // Sin cuenta: se gasta el mismo tiempo que con una real para que la
      // duración de la respuesta no revele qué correos están registrados.
      if (!usuario) {
        await gastarTiempoEquivalente(password)
        await registrar({ req, action: ACCION.ACCESO_FALLIDO, entity: 'usuario', after: { email } })
        return res.status(401).json(failure('Correo o clave incorrectos'))
      }

      if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
        const minutos = Math.ceil((usuario.lockedUntil - Date.now()) / 60000)
        return res
          .status(423)
          .json(failure(`Demasiados intentos fallidos. Vuelve a intentarlo en ${minutos} minutos`))
      }

      if (!usuario.active) {
        await registrar({ req, action: ACCION.ACCESO_FALLIDO, entity: 'usuario', entityId: usuario.id, after: { motivo: 'cuenta inactiva' } })
        return res.status(403).json(failure('Esta cuenta está desactivada'))
      }

      const correcta = await verificarClave(usuario.passwordHash, password)

      if (!correcta) {
        const intentos = usuario.failedAttempts + 1
        const bloqueo =
          intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MINUTOS * 60000) : null
        await UserModel.registrarFallo(usuario.id, intentos, bloqueo)
        await registrar({
          req,
          action: ACCION.ACCESO_FALLIDO,
          entity: 'usuario',
          entityId: usuario.id,
          after: { intentos, bloqueado: Boolean(bloqueo) },
        })
        return res.status(401).json(failure('Correo o clave incorrectos'))
      }

      const token = generarToken()
      const expiresAt = fechaExpiracion(env.sessionTtlHours)

      await SessionModel.create({
        userId: usuario.id,
        tokenHash: hashearToken(token),
        userAgent: (req.get('user-agent') ?? '').slice(0, 300) || null,
        ip: req.ip ?? null,
        expiresAt,
      })

      await UserModel.registrarAcceso(usuario.id)

      // `registrar` toma el actor de `req.usuario`; se asigna aquí en vez de
      // copiar `req`, porque `req.ip` es un getter del prototipo de Express y
      // un spread lo perdería.
      req.usuario = usuario
      await registrar({ req, action: ACCION.ACCEDER, entity: 'usuario', entityId: usuario.id })

      return res.json(ok(sesionIniciada(usuario, token, expiresAt)))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/auth/logout */
  async logout(req, res, next) {
    try {
      await SessionModel.revoke(req.sesion.id)
      await registrar({ req, action: ACCION.SALIR, entity: 'usuario', entityId: req.usuario.id })
      return res.json(ok({ cerrada: true }))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/auth/me */
  async me(req, res) {
    return res.json(ok(perfil(req.usuario)))
  },

  /** POST /api/auth/cambiar-clave */
  async cambiarClave(req, res, next) {
    try {
      const { actual, nueva } = req.validated

      const correcta = await verificarClave(req.usuario.passwordHash, actual)
      if (!correcta) {
        return res.status(400).json(failure('La clave actual no es correcta', { actual: 'No coincide' }))
      }

      if (actual === nueva) {
        return res.status(400).json(failure('La clave nueva debe ser distinta de la actual', { nueva: 'Debe ser distinta' }))
      }

      await UserModel.update(req.usuario.id, {
        passwordHash: await hashearClave(nueva),
        mustChangePassword: false,
      })

      // Cambiar la clave cierra el resto de sesiones: si alguien había entrado
      // con la anterior, se queda fuera.
      await SessionModel.revokeAllForUser(req.usuario.id)

      await registrar({ req, action: ACCION.CAMBIAR_CLAVE, entity: 'usuario', entityId: req.usuario.id })

      return res.json({
        success: true,
        message: 'Clave actualizada. Vuelve a iniciar sesión.',
        data: { cambiada: true },
      })
    } catch (error) {
      next(error)
    }
  },
}
