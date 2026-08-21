import { PatientModel } from '../models/patient.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { CaseReportModel } from '../models/caseReport.model.js'
import { admitirSolicitud } from '../services/promotion.service.js'
import { reporte } from '../views/caseReport.view.js'
import { candidatosPara } from '../services/matching.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { pacienteLista, pacienteSegunRol } from '../views/patient.view.js'
import { profesionalConCarga } from '../views/professional.view.js'

export const PatientController = {
  /** GET /api/patients */
  async index(req, res, next) {
    try {
      const pacientes = req.query.sinAsignar === 'true'
        ? await PatientModel.findSinAsignar()
        : await PatientModel.findAll({
            status: req.query.status || undefined,
            city: req.query.city || undefined,
          })

      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'paciente',
        after: { total: pacientes.length, filtro: req.query.status ?? 'todos' },
      })

      return res.json(ok(pacienteLista(pacientes, req.usuario), { total: pacientes.length }))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/patients/:id */
  async show(req, res, next) {
    try {
      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const asignacion = await CaseAssignmentModel.findActivaDePaciente(paciente.id)

      // Lo que haya reportado quien acompaña, aunque la persona haya pasado
      // por más de un profesional: el histórico completo es lo que permite
      // ver si un caso se quedó estancado.
      const reportes = await CaseReportModel.findDePaciente(paciente.id)

      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'paciente',
        entityId: paciente.id,
      })

      return res.json(
        ok({
          ...pacienteSegunRol(paciente, req.usuario),
          asignacion: asignacion
            ? {
                id: asignacion.id,
                desde: asignacion.startedAt,
                profesional: {
                  id: asignacion.professional.id,
                  nombre: asignacion.professional.fullName,
                },
              }
            : null,
          reportes: reportes.map((r) => ({
            ...reporte(r),
            profesional: r.assignment?.professional?.fullName ?? null,
          })),
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/patients/admitir/:supportRequestId */
  async admitir(req, res, next) {
    try {
      const paciente = await admitirSolicitud({
        supportRequestId: req.params.supportRequestId,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'paciente',
        entityId: paciente.id,
        after: { desdeSolicitud: req.params.supportRequestId },
      })

      return res
        .status(201)
        .json(created(pacienteSegunRol(paciente, req.usuario), 'Persona admitida. Ya se le puede asignar profesional.'))
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/patients/:id */
  async update(req, res, next) {
    try {
      const anterior = await PatientModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Persona no encontrada'))

      const paciente = await PatientModel.update(req.params.id, req.validated)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'paciente',
        entityId: paciente.id,
        before: pacienteSegunRol(anterior, req.usuario),
        after: pacienteSegunRol(paciente, req.usuario),
      })

      return res.json(ok(pacienteSegunRol(paciente, req.usuario)))
    } catch (error) {
      next(error)
    }
  },

  /** DELETE /api/patients/:id */
  async destroy(req, res, next) {
    try {
      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const asignacion = await CaseAssignmentModel.findActivaDePaciente(paciente.id)
      if (asignacion) {
        return res
          .status(409)
          .json(failure('Cierra primero el acompanamiento activo de esta persona.'))
      }

      await PatientModel.softDelete(paciente.id)
      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'paciente',
        entityId: paciente.id,
        before: pacienteSegunRol(paciente, req.usuario),
      })

      return res.json(ok({ eliminado: true, id: paciente.id }))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/patients/:id/candidatos — la pantalla de emparejamiento */
  async candidatos(req, res, next) {
    try {
      const poblaciones = req.query.poblaciones
        ? String(req.query.poblaciones).split(',').map((p) => p.trim()).filter(Boolean)
        : undefined

      const { paciente, candidatos } = await candidatosPara({
        patientId: req.params.id,
        poblaciones,
      })

      return res.json(
        ok({
          paciente: pacienteSegunRol(paciente, req.usuario),
          candidatos: candidatos.map((c) => profesionalConCarga(c, req.usuario)),
        }),
      )
    } catch (error) {
      next(error)
    }
  },
}
