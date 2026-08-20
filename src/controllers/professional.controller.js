import { ProfessionalModel } from '../models/professional.model.js'
import { UserModel } from '../models/user.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { aprobarPostulacion } from '../services/promotion.service.js'
import { cargaActual } from '../services/scheduling.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { profesionalLista, profesionalSegunRol } from '../views/professional.view.js'

export const ProfessionalController = {
  /** GET /api/professionals */
  async index(req, res, next) {
    try {
      const profesionales = await ProfessionalModel.findAll({
        status: req.query.status || undefined,
        city: req.query.city || undefined,
        modality: req.query.modality || undefined,
      })

      const carga = await cargaActual(profesionales.map((p) => p.id))
      const lista = profesionalLista(profesionales, req.usuario).map((p) => ({
        ...p,
        carga: carga(p.id),
      }))

      return res.json(ok(lista, { total: lista.length }))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/professionals/:id */
  async show(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      const casos = await CaseAssignmentModel.findDeProfesional(profesional.id)

      return res.json(
        ok({
          ...profesionalSegunRol(profesional, req.usuario),
          carga: casos.length,
          casos: casos.map((c) => ({
            id: c.id,
            paciente: { id: c.patient.id, nombre: c.patient.fullName },
            desde: c.startedAt,
          })),
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/professionals/aprobar/:volunteerId */
  async aprobar(req, res, next) {
    try {
      const { profesional, franjasCreadas } = await aprobarPostulacion({
        volunteerId: req.params.volunteerId,
        ajustes: req.validated,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'profesional',
        entityId: profesional.id,
        after: { desdePostulacion: req.params.volunteerId, franjasCreadas },
      })

      return res
        .status(201)
        .json(
          created(
            profesionalSegunRol(profesional, req.usuario),
            franjasCreadas > 0
              ? `Profesional creado con ${franjasCreadas} franjas de disponibilidad.`
              : 'Profesional creado. Falta cargarle franjas de disponibilidad.',
          ),
        )
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/professionals/:id */
  async update(req, res, next) {
    try {
      const anterior = await ProfessionalModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Profesional no encontrado'))

      // Enlazar con una cuenta del portal: es lo que permite que el profesional
      // entre y vea su propia agenda.
      if (req.validated.userId) {
        const cuenta = await UserModel.findById(req.validated.userId)
        if (!cuenta) return res.status(404).json(failure('Esa cuenta no existe'))
        if (cuenta.role !== 'PROFESIONAL') {
          return res
            .status(422)
            .json(failure('La cuenta debe tener el rol PROFESIONAL para enlazarla'))
        }

        const yaEnlazada = await ProfessionalModel.findByUserId(req.validated.userId)
        if (yaEnlazada && yaEnlazada.id !== req.params.id) {
          return res
            .status(409)
            .json(failure(`Esa cuenta ya está enlazada con ${yaEnlazada.fullName}`))
        }
      }

      const profesional = await ProfessionalModel.update(req.params.id, req.validated)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'profesional',
        entityId: profesional.id,
        before: profesionalSegunRol(anterior, req.usuario),
        after: profesionalSegunRol(profesional, req.usuario),
      })

      return res.json(ok(profesionalSegunRol(profesional, req.usuario)))
    } catch (error) {
      next(error)
    }
  },

  /** DELETE /api/professionals/:id */
  async destroy(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      const activos = await CaseAssignmentModel.contarActivas(profesional.id)
      if (activos > 0) {
        return res
          .status(409)
          .json(
            failure(
              `No se puede dar de baja: todavia acompana a ${activos} persona(s). Cierra esos casos primero.`,
            ),
          )
      }

      await ProfessionalModel.softDelete(profesional.id)
      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'profesional',
        entityId: profesional.id,
        before: profesionalSegunRol(profesional, req.usuario),
      })

      return res.json(ok({ eliminado: true, id: profesional.id }))
    } catch (error) {
      next(error)
    }
  },
}
