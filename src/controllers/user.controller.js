import { UserModel } from '../models/user.model.js'
import { SessionModel } from '../models/session.model.js'
import { hashearClave } from '../auth/password.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { usuarioPublico, usuarioLista } from '../views/user.view.js'

export const UserController = {
  /** GET /api/users */
  async index(req, res, next) {
    try {
      const usuarios = await UserModel.findAll({ role: req.query.role || undefined })
      return res.json(ok(usuarioLista(usuarios), { total: usuarios.length }))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/users */
  async store(req, res, next) {
    try {
      const { email, name, role, password } = req.validated

      const existente = await UserModel.findByEmail(email)
      if (existente) {
        return res
          .status(409)
          .json(failure('Ya hay una cuenta con ese correo', { email: 'Ya está registrado' }))
      }

      const usuario = await UserModel.create({
        email,
        name,
        role,
        passwordHash: await hashearClave(password),
        mustChangePassword: true,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'usuario',
        entityId: usuario.id,
        after: usuarioPublico(usuario),
      })

      return res
        .status(201)
        .json(created(usuarioPublico(usuario), 'Cuenta creada. La persona deberá cambiar la clave al entrar.'))
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/users/:id */
  async update(req, res, next) {
    try {
      const anterior = await UserModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Usuario no encontrado'))

      // Cambiar el correo es cambiar con qué se entra: no puede chocar con otra cuenta.
      if (req.validated.email && req.validated.email !== anterior.email) {
        const ocupado = await UserModel.findByEmail(req.validated.email)
        if (ocupado) {
          return res
            .status(409)
            .json(failure('Ya hay una cuenta con ese correo', { email: 'Ya está registrado' }))
        }
      }

      // Nadie puede quitarse a sí mismo el rol de administrador ni desactivarse:
      // es la forma más común de quedarse sin acceso al portal.
      if (anterior.id === req.usuario.id) {
        if (req.validated.role && req.validated.role !== anterior.role) {
          return res.status(400).json(failure('No puedes cambiar tu propio rol'))
        }
        if (req.validated.active === false) {
          return res.status(400).json(failure('No puedes desactivar tu propia cuenta'))
        }
      }

      if (anterior.role === 'ADMIN' && (req.validated.role !== undefined || req.validated.active === false)) {
        const admins = await UserModel.findAll({ role: 'ADMIN' })
        const activos = admins.filter((u) => u.active)
        if (activos.length <= 1) {
          return res
            .status(400)
            .json(failure('Debe quedar al menos un administrador activo'))
        }
      }

      const usuario = await UserModel.update(req.params.id, req.validated)

      // Bajar el rol o desactivar debe surtir efecto ya, no cuando caduque la sesión.
      if (req.validated.role !== undefined || req.validated.active === false) {
        await SessionModel.revokeAllForUser(usuario.id)
      }

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'usuario',
        entityId: usuario.id,
        before: usuarioPublico(anterior),
        after: usuarioPublico(usuario),
      })

      return res.json(ok(usuarioPublico(usuario)))
    } catch (error) {
      next(error)
    }
  },

  /** DELETE /api/users/:id — borrado lógico */
  async destroy(req, res, next) {
    try {
      const usuario = await UserModel.findById(req.params.id)
      if (!usuario) return res.status(404).json(failure('Usuario no encontrado'))

      if (usuario.id === req.usuario.id) {
        return res.status(400).json(failure('No puedes eliminar tu propia cuenta'))
      }

      if (usuario.role === 'ADMIN') {
        const activos = (await UserModel.findAll({ role: 'ADMIN' })).filter((u) => u.active)
        if (activos.length <= 1) {
          return res.status(400).json(failure('Debe quedar al menos un administrador activo'))
        }
      }

      await UserModel.softDelete(usuario.id)
      await SessionModel.revokeAllForUser(usuario.id)

      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'usuario',
        entityId: usuario.id,
        before: usuarioPublico(usuario),
      })

      return res.json(ok({ eliminado: true, id: usuario.id }))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/users/:id/restablecer-clave */
  async resetPassword(req, res, next) {
    try {
      const usuario = await UserModel.findById(req.params.id)
      if (!usuario) return res.status(404).json(failure('Usuario no encontrado'))

      const { password } = req.validated

      await UserModel.update(usuario.id, {
        passwordHash: await hashearClave(password),
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
      })
      await SessionModel.revokeAllForUser(usuario.id)

      await registrar({
        req,
        action: ACCION.CAMBIAR_CLAVE,
        entity: 'usuario',
        entityId: usuario.id,
        after: { restablecidaPor: req.usuario.email },
      })

      return res.json(ok({ restablecida: true }))
    } catch (error) {
      next(error)
    }
  },
}
