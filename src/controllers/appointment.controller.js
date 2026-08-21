import { AppointmentModel } from '../models/appointment.model.js'
import { ProfessionalModel } from '../models/professional.model.js'
import {
  crearCita,
  cambiarEstado,
  reprogramar,
  asignarCaso,
  cerrarCaso,
} from '../services/appointment.service.js'
import { huecosDisponibles } from '../services/scheduling.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { citaAgendada } from '../notifications/eventos.js'
import { formatearLocal } from '../services/timezone.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { cita, citaLista, citaListaParaProfesional } from '../views/appointment.view.js'
import { huecoLista } from '../views/availability.view.js'
import { DomainError } from '../errors/DomainError.js'

/** Lee un rango de fechas de la query, con valores por defecto sensatos. */
function rangoDe(query, diasPorDefecto = 7) {
  const desde = query.desde ? new Date(query.desde) : new Date()
  const hasta = query.hasta
    ? new Date(query.hasta)
    : new Date(desde.getTime() + diasPorDefecto * 86400000)

  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    throw new DomainError('RANGO_INVALIDO', 'Las fechas no son validas')
  }
  return { desde, hasta }
}

export const AppointmentController = {
  /** GET /api/appointments — la agenda */
  async index(req, res, next) {
    try {
      const { desde, hasta } = rangoDe(req.query, 7)

      const citas = await AppointmentModel.findEnRango({
        desde,
        hasta,
        professionalId: req.query.professionalId || undefined,
        patientId: req.query.patientId || undefined,
        status: req.query.estado || undefined,
      })

      return res.json(ok(citaLista(citas), { desde, hasta, total: citas.length }))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/appointments/mias — lo que ve un profesional de si mismo */
  async mias(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findByUserId(req.usuario.id)
      if (!profesional) {
        return res
          .status(404)
          .json(failure('Tu cuenta todavia no esta enlazada con una ficha de profesional'))
      }

      const citas = await AppointmentModel.proximasDeProfesional(profesional.id)
      return res.json(
        ok(citaListaParaProfesional(citas), { profesional: profesional.fullName, total: citas.length }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/appointments/:id */
  async show(req, res, next) {
    try {
      const encontrada = await AppointmentModel.findById(req.params.id)
      if (!encontrada) return res.status(404).json(failure('Cita no encontrada'))
      return res.json(ok(cita(encontrada)))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/appointments */
  async store(req, res, next) {
    try {
      const { professionalId, patientId, inicio, fin, modalidad } = req.validated

      const nueva = await crearCita({
        professionalId,
        patientId,
        inicio,
        fin,
        modalidad,
        actorId: req.usuario.id,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'cita',
        entityId: nueva.id,
        after: { inicio, fin, professionalId, patientId },
      })

      // El aviso lleva cuándo y un enlace; los datos de la persona los abre
      // el profesional entrando con su correo, no este correo.
      await citaAgendada({
        cita: nueva,
        profesional: nueva.professional,
        cuando: formatearLocal(nueva.startsAt),
      })

      return res.status(201).json(created(cita(nueva), 'Cita agendada.'))
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/appointments/:id/estado */
  async cambiarEstado(req, res, next) {
    try {
      const anterior = await AppointmentModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Cita no encontrada'))

      const actualizada = await cambiarEstado({
        citaId: req.params.id,
        nuevoEstado: req.validated.estado,
        motivo: req.validated.motivo,
        actorId: req.usuario.id,
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'cita',
        entityId: actualizada.id,
        before: { estado: anterior.status },
        after: { estado: actualizada.status, motivo: req.validated.motivo || null },
      })

      return res.json(ok(cita(actualizada)))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/appointments/:id/reprogramar */
  async reprogramar(req, res, next) {
    try {
      const nueva = await reprogramar({
        citaId: req.params.id,
        inicio: req.validated.inicio,
        fin: req.validated.fin,
        modalidad: req.validated.modalidad,
        actorId: req.usuario.id,
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'cita',
        entityId: req.params.id,
        after: { reprogramadaA: nueva.id, inicio: nueva.startsAt },
      })

      return res
        .status(201)
        .json(created(cita(nueva), 'Cita reprogramada. La anterior queda en el historial.'))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/appointments/huecos */
  async huecos(req, res, next) {
    try {
      if (!req.query.professionalId) {
        return res.status(400).json(failure('Falta el parametro professionalId'))
      }
      const { desde, hasta } = rangoDe(req.query, 14)

      const libres = await huecosDisponibles({
        professionalId: req.query.professionalId,
        desde,
        hasta,
        duracionMinutos: req.query.duracion ? Number(req.query.duracion) : undefined,
        modalidad: req.query.modalidad || undefined,
      })

      return res.json(ok(huecoLista(libres), { desde, hasta, total: libres.length }))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/appointments/asignar */
  async asignar(req, res, next) {
    try {
      const asignacion = await asignarCaso({
        professionalId: req.validated.professionalId,
        patientId: req.validated.patientId,
        actorId: req.usuario.id,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'asignacion',
        entityId: asignacion.id,
        after: {
          professionalId: asignacion.professionalId,
          patientId: asignacion.patientId,
        },
      })

      return res.status(201).json(
        created(
          {
            id: asignacion.id,
            professionalId: asignacion.professionalId,
            patientId: asignacion.patientId,
            desde: asignacion.startedAt,
          },
          'Profesional asignado.',
        ),
      )
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/appointments/asignaciones/:id/cerrar */
  async cerrarAsignacion(req, res, next) {
    try {
      const cerrada = await cerrarCaso({
        asignacionId: req.params.id,
        motivo: req.validated.motivo,
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'asignacion',
        entityId: cerrada.id,
        after: { estado: 'CERRADA', motivo: req.validated.motivo },
      })

      return res.json(ok({ id: cerrada.id, cerrada: true, motivo: cerrada.closeReason }))
    } catch (error) {
      next(error)
    }
  },
}
