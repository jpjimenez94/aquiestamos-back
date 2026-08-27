import { AvailabilityModel } from '../models/availability.model.js'
import { ProfessionalModel } from '../models/professional.model.js'
import { puede } from '../auth/permissions.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { reglaLista, bloqueoLista, bloqueo } from '../views/availability.view.js'

/**
 * Un profesional puede editar SUS franjas y nadie más las suyas. Estas tres
 * funciones son las que imponen esa frontera.
 *
 * Antes había DOS ayudantes autorizando lo mismo —`puedeTocarA` para leer,
 * `esPropio` para escribir— cada uno con su propia idea de quién es
 * administrador. Dos derivaciones en paralelo de la misma regla es exactamente
 * la forma que tenían los fallos de las salas de videollamada.
 */
async function esSuAgenda(usuario, professionalId) {
  const suyo = await ProfessionalModel.findByUserId(usuario.id)
  return Boolean(suyo && suyo.id === professionalId)
}

/** Leer: la coordinación ve todas las agendas; el profesional, la suya. */
async function puedeVer(usuario, professionalId) {
  if (puede(usuario, 'disponibilidad:leer')) return true
  if (puede(usuario, 'disponibilidad:leer:propia')) return esSuAgenda(usuario, professionalId)
  return false
}

/**
 * Escribir: quien tenga `disponibilidad:editar` —hoy solo ADMIN, por su `*`—
 * o el propio profesional sobre la suya.
 *
 * Los tres métodos de escritura decían `req.usuario.role !== 'ADMIN'`, que lee
 * el campo viejo de rol en vez de la matriz. Una cuenta con `roles: ['ADMIN']`
 * y `role` de otra cosa es administradora para `puede()` y no lo era aquí.
 */
async function puedeEditar(usuario, professionalId) {
  if (puede(usuario, 'disponibilidad:editar')) return true
  if (puede(usuario, 'disponibilidad:editar:propia')) return esSuAgenda(usuario, professionalId)
  return false
}

export const AvailabilityController = {
  /** GET /api/professionals/:id/disponibilidad */
  async index(req, res, next) {
    try {
      if (!(await puedeVer(req.usuario, req.params.id))) {
        return res.status(403).json(failure('Solo puedes ver tu propia disponibilidad'))
      }

      const [reglas, bloqueos] = await Promise.all([
        AvailabilityModel.reglasDe(req.params.id),
        AvailabilityModel.bloqueosDe(req.params.id, { desde: new Date() }),
      ])

      return res.json(ok({ franjas: reglaLista(reglas), bloqueos: bloqueoLista(bloqueos) }))
    } catch (error) {
      next(error)
    }
  },

  /** PUT /api/professionals/:id/disponibilidad — reemplaza todas las franjas */
  async reemplazar(req, res, next) {
    try {
      if (!(await puedeEditar(req.usuario, req.params.id))) {
        return res.status(403).json(failure('Solo puedes editar tu propia disponibilidad'))
      }

      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      const anteriores = await AvailabilityModel.reglasDe(req.params.id)
      await AvailabilityModel.reemplazarReglas(req.params.id, req.validated.franjas)
      const nuevas = await AvailabilityModel.reglasDe(req.params.id)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'disponibilidad',
        entityId: req.params.id,
        before: { franjas: anteriores.length },
        after: { franjas: nuevas.length },
      })

      return res.json(ok(reglaLista(nuevas)))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/professionals/:id/bloqueos */
  async crearBloqueo(req, res, next) {
    try {
      if (!(await puedeEditar(req.usuario, req.params.id))) {
        return res.status(403).json(failure('Solo puedes bloquear tu propia agenda'))
      }

      const creado = await AvailabilityModel.crearBloqueo({
        professionalId: req.params.id,
        startsAt: req.validated.inicio,
        endsAt: req.validated.fin,
        reason: req.validated.motivo || null,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'bloqueo',
        entityId: creado.id,
        after: { inicio: creado.startsAt, fin: creado.endsAt },
      })

      return res.status(201).json(created(bloqueo(creado), 'Bloqueo agregado.'))
    } catch (error) {
      next(error)
    }
  },

  /** DELETE /api/professionals/:id/bloqueos/:bloqueoId */
  async borrarBloqueo(req, res, next) {
    try {
      if (!(await puedeEditar(req.usuario, req.params.id))) {
        return res.status(403).json(failure('Solo puedes editar tu propia agenda'))
      }

      const existente = await AvailabilityModel.findBloqueo(req.params.bloqueoId)
      if (!existente || existente.professionalId !== req.params.id) {
        return res.status(404).json(failure('Bloqueo no encontrado'))
      }

      await AvailabilityModel.borrarBloqueo(req.params.bloqueoId)
      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'bloqueo',
        entityId: req.params.bloqueoId,
      })

      return res.json(ok({ eliminado: true }))
    } catch (error) {
      next(error)
    }
  },
}
