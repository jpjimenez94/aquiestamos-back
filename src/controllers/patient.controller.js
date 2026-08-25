import { PatientModel } from '../models/patient.model.js'
import { PatientNoteModel } from '../models/patientNote.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { CaseReportModel } from '../models/caseReport.model.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { cita } from '../views/appointment.view.js'
import { crearEnlaceEncuesta } from '../auth/enlaceEncuesta.js'
import { crearEnlaceFeedback } from '../auth/enlaceFeedback.js'
import { env } from '../config/env.js'
import { prisma } from '../config/database.js'
import { admitirSolicitud } from '../services/promotion.service.js'
import { reporte } from '../views/caseReport.view.js'
import { pacienteAdmitido } from '../notifications/eventos.js'
import { candidatosPara } from '../services/matching.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { pacienteLista, pacienteSegunRol } from '../views/patient.view.js'
import { profesionalConCarga } from '../views/professional.view.js'
import {
  ETIQUETAS as ETIQUETAS_ASIGNACION,
  SIGUIENTE_PASO,
} from '../services/assignmentState.service.js'
import {
  ETIQUETAS_FEEDBACK_SENTIR,
  ETIQUETAS_FEEDBACK_CONTINUAR,
} from '../catalogos.js'

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

      const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(paciente.id)

      // Lo que haya reportado quien acompaña, aunque la persona haya pasado
      // por más de un profesional: el histórico completo es lo que permite
      // ver si un caso se quedó estancado.
      const reportes = await CaseReportModel.findDePaciente(paciente.id)

      // Las citas van en la misma ficha: quien coordina no debería tener que
      // irse a la agenda a buscar cuándo es. La vista ya trae la hora en
      // Bogotá y quién es el profesional.
      const citas = await AppointmentModel.findDePaciente(paciente.id)

      /**
       * Retroalimentación directa de la persona sobre sus sesiones (formulario breve de experiencia).
       */
      const feedbacks = await prisma.patientFeedback.findMany({
        where: { patientId: paciente.id },
        orderBy: { createdAt: 'desc' },
        include: { assignment: { include: { professional: { select: { fullName: true } } } } },
      })
      const enlaceFeedback = `${env.sitioUrl.replace(/\/$/, '')}/experiencia/${crearEnlaceFeedback(paciente.id)}`

      /**
       * Con el caso cerrado, la ficha trae la encuesta: el enlace para
       * mandársela a la persona por WhatsApp y, si ya respondió, lo que dijo.
       * El enlace sale de SITIO_URL, como todos.
       */
      let encuesta = null
      if (paciente.status === 'CERRADO') {
        const cerrada = await prisma.caseAssignment.findFirst({
          where: { patientId: paciente.id, status: 'CERRADA', deletedAt: null },
          orderBy: { endedAt: 'desc' },
          include: { survey: true },
        })
        if (cerrada) {
          encuesta = {
            enlace: `${env.sitioUrl.replace(/\/$/, '')}/encuesta/${crearEnlaceEncuesta(cerrada.id)}`,
            respondida: cerrada.survey != null,
            ayudo: cerrada.survey?.helped ?? null,
            recomendaria: cerrada.survey?.wouldRecommend ?? null,
            comentario: cerrada.survey?.comment ?? null,
          }
        }
      }

      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'paciente',
        entityId: paciente.id,
      })

      return res.json(
        ok({
          ...pacienteSegunRol(paciente, req.usuario),
          /**
           * La negociación con el profesional, no solo "quién lo lleva".
           *
           * El estado es lo que decide qué botón se le enseña a quien
           * coordina: proponer, escribirle a la persona, o hacer seguimiento.
           * Sin esto, el portal solo sabía decir "asignado" y el resto vivía
           * en el historial de WhatsApp de alguien.
           */
          asignacion: asignacion
            ? {
                id: asignacion.id,
                estado: asignacion.status,
                estadoLegible: ETIQUETAS_ASIGNACION[asignacion.status] ?? asignacion.status,
                siguientePaso: SIGUIENTE_PASO[asignacion.status] ?? null,
                desde: asignacion.startedAt,
                respondioEn: asignacion.respondedAt,
                // Lo que el profesional puso él mismo desde su enlace.
                diasQuePuede: asignacion.acceptedDays ?? [],
                franjasQuePuede: asignacion.acceptedSlots ?? [],
                nota: asignacion.availabilityNote,
                motivoRechazo: asignacion.declineReason,
                profesional: {
                  id: asignacion.professional.id,
                  nombre: asignacion.professional.fullName,
                  // Para armar el enlace de WhatsApp desde el portal.
                  telefono: asignacion.professional.phone,
                },
              }
            : null,
          reportes: reportes.map((r) => ({
            ...reporte(r),
            profesional: r.assignment?.professional?.fullName ?? null,
          })),
          feedbacks: feedbacks.map((f) => ({
            id: f.id,
            howFelt: f.howFelt,
            howFeltLegible: ETIQUETAS_FEEDBACK_SENTIR[f.howFelt] ?? f.howFelt,
            wantsToContinue: f.wantsToContinue,
            wantsToContinueLegible: ETIQUETAS_FEEDBACK_CONTINUAR[f.wantsToContinue] ?? f.wantsToContinue,
            comment: f.comment,
            profesional: f.assignment?.professional?.fullName ?? null,
            createdAt: f.createdAt,
          })),
          enlaceFeedback,
          citas: citas.map(cita),
          encuesta,
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
        ajustes: req.validated,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'paciente',
        entityId: paciente.id,
        after: { desdeSolicitud: req.params.supportRequestId, prioridad: paciente.priority },
      })

      await pacienteAdmitido(paciente)

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

      const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(paciente.id)
      if (asignacion) {
        if (req.usuario?.role === 'ADMIN') {
          await CaseAssignmentModel.cancelar(
            asignacion.id,
            'Registro eliminado por administración',
          )
        } else {
          return res
            .status(409)
            .json(failure('Cierra primero el acompañamiento activo de esta persona.'))
        }
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

  /** POST /api/patients/:id/notes — Agregar nota de seguimiento */
  async agregarNota(req, res, next) {
    try {
      const { note } = req.body
      if (!note || typeof note !== 'string' || !note.trim()) {
        return res.status(400).json(failure('La nota no puede estar vacía'))
      }

      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const authorName = req.usuario?.fullName || req.usuario?.email || 'Coordinación'
      const authorEmail = req.usuario?.email || 'sistema'

      const nuevaNota = await PatientNoteModel.create({
        patientId: paciente.id,
        note: note.trim(),
        authorName,
        authorEmail,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'paciente_nota',
        entityId: nuevaNota.id,
        after: {
          pacienteId: paciente.id,
          pacienteNombre: paciente.fullName,
          nota: nuevaNota.note,
          autor: authorName,
        },
      })

      const notas = await PatientNoteModel.findDePaciente(paciente.id)

      return res.status(201).json(
        created({
          nota: {
            id: nuevaNota.id,
            nota: nuevaNota.note,
            autor: nuevaNota.authorName,
            email: nuevaNota.authorEmail,
            fecha: nuevaNota.createdAt,
          },
          notas: notas.map((n) => ({
            id: n.id,
            nota: n.note,
            autor: n.authorName,
            email: n.authorEmail,
            fecha: n.createdAt,
          })),
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/patients/:id/notes — Listar notas de seguimiento */
  async obtenerNotas(req, res, next) {
    try {
      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const notas = await PatientNoteModel.findDePaciente(paciente.id)

      return res.json(
        ok(
          notas.map((n) => ({
            id: n.id,
            nota: n.note,
            autor: n.authorName,
            email: n.authorEmail,
            fecha: n.createdAt,
          })),
        ),
      )
    } catch (error) {
      next(error)
    }
  },
}
