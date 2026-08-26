import { AppointmentModel } from '../models/appointment.model.js'
import { ProfessionalModel } from '../models/professional.model.js'
import {
  crearCita,
  cambiarEstado,
  reprogramar,
  proponerCaso,
  confirmarHorario,
  cancelarAsignacion,
  cerrarCaso,
} from '../services/appointment.service.js'
import { huecosDisponibles } from '../services/scheduling.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { citaAgendada } from '../notifications/eventos.js'
import { formatearLocal } from '../services/timezone.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { cita as citaVista, citaLista, citaListaParaProfesional } from '../views/appointment.view.js'
import { huecoLista } from '../views/availability.view.js'
import { DomainError } from '../errors/DomainError.js'
import { crearEnlaceConsentimiento } from '../auth/enlaceConsentimiento.js'
import { crearEnlaceDocumentos } from '../auth/enlaceDocumentos.js'
import { env } from '../config/env.js'

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

  /** GET /api/appointments/historial — listado histórico completo con métricas */
  async historial(req, res, next) {
    try {
      const desde = req.query.desde ? new Date(req.query.desde) : undefined
      const hasta = req.query.hasta ? new Date(req.query.hasta) : undefined
      const professionalId = req.query.professionalId || undefined
      const patientId = req.query.patientId || undefined
      const status = req.query.estado || undefined
      const search = req.query.q || undefined

      const citas = await AppointmentModel.findHistorial({
        desde,
        hasta,
        professionalId,
        patientId,
        status,
        search,
      })

      // Cálculo de métricas agregadas del conjunto filtrado
      let realizadas = 0
      let canceladas = 0
      let noAsistio = 0
      let programadas = 0
      let confirmadas = 0

      for (const c of citas) {
        if (c.status === 'REALIZADA') realizadas++
        else if (c.status === 'CANCELADA') canceladas++
        else if (c.status === 'NO_ASISTIO') noAsistio++
        else if (c.status === 'PROGRAMADA') programadas++
        else if (c.status === 'CONFIRMADA') confirmadas++
      }

      const terminadas = realizadas + noAsistio + canceladas
      const tasaAsistencia = terminadas > 0 ? Math.round((realizadas / terminadas) * 100) : 100

      return res.json(
        ok(citaLista(citas), {
          total: citas.length,
          metricas: {
            total: citas.length,
            realizadas,
            confirmadas,
            programadas,
            canceladas,
            noAsistio,
            tasaAsistencia,
          },
        }),
      )
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

      /**
       * El enlace de firma va COMPLETO y sale de SITIO_URL, como el del
       * tamizaje y por la misma cicatriz: armado en el navegador, quien
       * trabaja en local le manda a una persona un enlace a localhost.
       */
      return res.json(
        ok({
          ...citaVista(encontrada),
          consentimiento: {
            enlace: `${env.sitioUrl.replace(/\/$/, '')}/consentimiento/${crearEnlaceConsentimiento(encontrada.id)}`,
          },
          // El enlace por el que el profesional sube sus documentos, para el
          // modal de la tarjeta en este mismo detalle. Solo si falta.
          enlaceDocumentos: encontrada.professional?.professionalCardVerified
            ? null
            : `${env.sitioUrl.replace(/\/$/, '')}/documentos/${crearEnlaceDocumentos(encontrada.professionalId)}`,
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/appointments */
  async store(req, res, next) {
    try {
      const { professionalId, patientId, inicio, fin, modalidad, estado, fueraDeFranja } = req.validated

      const nueva = await crearCita({
        professionalId,
        patientId,
        inicio,
        fin,
        modalidad,
        estado: estado ?? 'PROGRAMADA',
        permitirFueraDeFranja: fueraDeFranja,
        actorId: req.usuario.id,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'cita',
        entityId: nueva.id,
        after: { inicio, fin, professionalId, patientId, estado: nueva.status },
      })

      // El aviso lleva cuándo y un enlace; los datos de la persona los abre
      // el profesional entrando con su correo, no este correo.
      await citaAgendada({
        cita: nueva,
        profesional: nueva.professional,
        cuando: formatearLocal(nueva.startsAt),
      })

      return res.status(201).json(created(citaVista(nueva), 'Cita agendada.'))
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

      return res.json(ok(citaVista(actualizada)))
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/appointments/:id/consentimiento */
  async actualizarConsentimiento(req, res, next) {
    try {
      const anterior = await AppointmentModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Cita no encontrada'))

      const { consentSigned, consentSignedDocumentUrl } = req.validated

      const dataToUpdate = {
        consentSigned,
        ...(consentSignedDocumentUrl !== undefined ? { consentSignedDocumentUrl } : {}),
        ...(consentSigned ? { consentSignedAt: new Date() } : { consentSignedAt: null }),
      }

      const actualizada = await AppointmentModel.update(req.params.id, dataToUpdate)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'cita_consentimiento',
        entityId: actualizada.id,
        before: { consentSigned: anterior.consentSigned },
        after: { consentSigned: actualizada.consentSigned },
      })

      return res.json(ok(citaVista(actualizada), 'Consentimiento informado actualizado'))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/appointments/:id/reprogramar */
  async reprogramar(req, res, next) {
    try {
      const datos = req.validated
      const nueva = await reprogramar({
        citaId: req.params.id,
        inicio: datos.inicio,
        fin: datos.fin,
        modalidad: datos.modalidad,
        meetingUrl: datos.meetingUrl,
        meetingProvider: datos.meetingProvider,
        actorId: req.usuario?.id,
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
        .json(created(citaVista(nueva), 'Cita reprogramada. La anterior queda en el historial.'))
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
      const asignacion = await proponerCaso({
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

  /**
   * POST /api/appointments/asignaciones/:id/confirmar
   *
   * La persona acompañada eligió horario: se agenda y el caso arranca. Es el
   * paso 10 del flujo y, de paso, la primera pantalla del portal que llega a
   * crear una cita.
   */
  async confirmar(req, res, next) {
    try {
      const { inicio, fin, modalidad, fueraDeFranja, meetingUrl, meetingProvider } = req.validated

      const { cita, asignacion } = await confirmarHorario({
        asignacionId: req.params.id,
        inicio,
        fin,
        modalidad,
        fueraDeFranja,
        meetingUrl,
        meetingProvider,
        actorId: req.usuario.id,
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'asignacion',
        entityId: asignacion.id,
        before: { estado: asignacion.status },
        after: {
          estado: 'ACTIVA',
          cita: cita.id,
          inicio,
          // Que alguien agendara fuera de lo que el profesional tiene
          // declarado no puede quedar solo en su cabeza.
          fueraDeFranja: Boolean(fueraDeFranja),
        },
      })

      await citaAgendada({
        cita,
        profesional: cita.professional,
        cuando: formatearLocal(cita.startsAt),
      })

      return res.status(201).json(created(citaVista(cita), 'Cita agendada. El caso queda activo.'))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/appointments/asignaciones/:id/cancelar */
  async cancelar(req, res, next) {
    try {
      const cancelada = await cancelarAsignacion({
        asignacionId: req.params.id,
        motivo: req.validated.motivo,
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'asignacion',
        entityId: cancelada.id,
        after: { estado: 'CANCELADA', motivo: req.validated.motivo },
      })

      return res.json(ok({ id: cancelada.id, estado: cancelada.status }))
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
