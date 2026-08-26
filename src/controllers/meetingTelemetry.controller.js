import { prisma } from '../config/database.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { MeetingAccessLogModel } from '../models/meetingAccessLog.model.js'
import { ok } from '../views/response.view.js'
import { generarEnlaceVideollamada, verificarTokenSala } from '../services/meeting.service.js'
import { registrar, ACCION } from '../services/audit.service.js'

function primerNombre(nombre) {
  if (!nombre) return ''
  return nombre.trim().split(/\s+/)[0]
}

export const MeetingTelemetryController = {
  /**
   * GET /api/meetings/:tokenOrId/info
   * Retorna información para la sala de espera institucional validando el token HMAC.
   */
  async info(req, res, next) {
    try {
      const { id: tokenOrId } = req.params
      const verified = verificarTokenSala(tokenOrId)

      if (!verified) {
        return res.status(404).json({ success: false, message: 'Enlace de videollamada no válido o alterado.' })
      }

      const cita = await AppointmentModel.findById(verified.aid)
      if (!cita) {
        return res.status(404).json({ success: false, message: 'La sesión no existe o fue cancelada.' })
      }

      const targetUrl = cita.meetingUrl || (cita.modality === 'VIRTUAL' ? generarEnlaceVideollamada(cita.id) : null)
      const rolParam = req.query.rol ? String(req.query.rol).toUpperCase() : null
      const rolFinal = verified.rol || (rolParam === 'PROFESIONAL' ? 'PROFESIONAL' : 'PACIENTE')

      return res.json(
        ok({
          id: cita.id,
          token: tokenOrId,
          rol: rolFinal,
          startsAt: cita.startsAt,
          endsAt: cita.endsAt,
          modality: cita.modality,
          status: cita.status,
          patientFirstName: primerNombre(cita.patient?.fullName),
          professionalName: cita.professional?.fullName ?? 'Profesional de la Red',
          targetMeetingUrl: targetUrl,
          meetingProvider: cita.meetingProvider ?? 'JITSI_AUTO',
          patientFirstJoinedAt: cita.patientFirstJoinedAt,
          professionalFirstJoinedAt: cita.professionalFirstJoinedAt,
          totalCallDurationSeconds: cita.totalCallDurationSeconds,
        })
      )
    } catch (error) {
      next(error)
    }
  },

  /**
   * POST /api/meetings/:tokenOrId/join
   * Registra el ingreso validando el rol sellado en el token HMAC.
   */
  async join(req, res, next) {
    try {
      const { id: tokenOrId } = req.params
      const verified = verificarTokenSala(tokenOrId)

      if (!verified) {
        return res.status(404).json({ success: false, message: 'Enlace de videollamada no válido o alterado.' })
      }

      const cita = await AppointmentModel.findById(verified.aid)
      if (!cita) {
        return res.status(404).json({ success: false, message: 'La sesión no existe.' })
      }

      const roleBody = req.body?.role ? String(req.body.role).toUpperCase() : null
      // Si el token es firmado HMAC, el rol del token MANDA (imposible de manipular por el cliente)
      const rolValido = verified.rol || (['PROFESIONAL', 'COORDINACION', 'INVITADO'].includes(roleBody) ? roleBody : 'PACIENTE')

      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
      const userAgent = req.headers['user-agent'] || ''
      const ahora = new Date()

      // 1. Crear registro de acceso
      const nombreParticipante = (rolValido === 'PACIENTE' ? cita.patient?.fullName : cita.professional?.fullName) || null
      const log = await MeetingAccessLogModel.create({
        appointmentId: cita.id,
        role: rolValido,
        participantName: nombreParticipante,
        joinedAt: ahora,
        lastPingAt: ahora,
        ipAddress: typeof ip === 'string' ? ip.slice(0, 100) : null,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null,
      })

      // 2. Actualizar primera conexión en la cita si corresponde
      const updates = {}
      if (rolValido === 'PACIENTE' && !cita.patientFirstJoinedAt) {
        updates.patientFirstJoinedAt = ahora
      } else if (rolValido === 'PROFESIONAL' && !cita.professionalFirstJoinedAt) {
        updates.professionalFirstJoinedAt = ahora
      }

      if (Object.keys(updates).length > 0) {
        await AppointmentModel.update(cita.id, updates)
      }

      // 3. Registrar en Auditoría General del Sistema
      const actorEmail = rolValido === 'PACIENTE'
        ? `paciente:${primerNombre(cita.patient?.fullName)}`
        : (rolValido === 'PROFESIONAL'
            ? `profesional:${primerNombre(cita.professional?.fullName)}`
            : (req.usuario?.email || 'coordinacion'))

      await registrar({
        req,
        action: 'ingresar_sala',
        entity: 'sesion_virtual',
        entityId: cita.id,
        actorEmail,
        after: {
          rol: rolValido,
          participante: nombreParticipante,
          citaId: cita.id,
          paciente: cita.patient?.fullName,
          profesional: cita.professional?.fullName,
          horario: cita.startsAt,
        },
      })

      const targetUrl = cita.meetingUrl || generarEnlaceVideollamada(cita.id)

      return res.json(
        ok({
          logId: log.id,
          targetMeetingUrl: targetUrl,
          joinedAt: log.joinedAt,
          rol: rolValido,
        })
      )
    } catch (error) {
      next(error)
    }
  },

  /**
   * POST /api/meetings/logs/:logId/ping
   * Actualiza el latido de presencia y duración de la llamada.
   */
  async ping(req, res, next) {
    try {
      const { logId } = req.params
      const log = await MeetingAccessLogModel.findById(logId)
      if (!log) {
        return res.status(404).json({ success: false, message: 'Registro de sesión no encontrado.' })
      }

      const ahora = Date.now()
      const inicio = new Date(log.joinedAt).getTime()
      const durationSeconds = Math.max(0, Math.round((ahora - inicio) / 1000))

      const actualizado = await MeetingAccessLogModel.updatePing(logId, durationSeconds)

      const allLogs = await MeetingAccessLogModel.findByAppointment(log.appointmentId)
      const maxDuration = Math.max(...allLogs.map((l) => l.durationSeconds || 0), durationSeconds)

      await AppointmentModel.update(log.appointmentId, {
        totalCallDurationSeconds: maxDuration,
      })

      return res.json(
        ok({
          logId: actualizado.id,
          durationSeconds: actualizado.durationSeconds,
        })
      )
    } catch (error) {
      next(error)
    }
  },
}
