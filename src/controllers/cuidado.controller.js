import {
  resumenParaCoordinacion,
  convocarSesionGrupal,
  cambiarEstadoSesionGrupal,
  marcarAsistencia,
  marcarSupervisor,
} from '../services/cuidado.service.js'
import { sesionGrupalConvocada } from '../notifications/eventos.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'

/**
 * CONTROLADOR: cuidado del equipo, lado del portal.
 *
 * Lo que hace coordinación: ver quién pidió el espacio, quién se ofreció a
 * facilitar, y convocar la sesión grupal. Lo que hace el profesional desde su
 * enlace vive en `sharedCase.controller.js`, con el token de su caso.
 */
export const CuidadoController = {
  /** GET /api/cuidado — lo que ve el módulo al abrirse. */
  async resumen(req, res, next) {
    try {
      return res.json(ok(await resumenParaCoordinacion()))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/cuidado/sesiones — convocar una sesión grupal. */
  async convocar(req, res, next) {
    try {
      const { sesion, facilitador, invitados } = await convocarSesionGrupal({
        ...req.validated,
        createdByEmail: req.usuario?.email ?? null,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'sesion_grupal',
        entityId: sesion.id,
        after: {
          facilitador: facilitador.fullName,
          inicio: sesion.startsAt,
          invitados: invitados.map((p) => p.fullName),
        },
      })

      /**
       * Avisar es parte de convocar, no un paso aparte que alguien tenga que
       * recordar. A cada invitado y al facilitador les sale su correo con la
       * hora, el enlace y la agenda.
       */
      await sesionGrupalConvocada({ sesion, facilitador, invitados })

      return res.status(201).json(created({ id: sesion.id }, 'Sesión convocada. Ya les salió el correo a todos.'))
    } catch (error) {
      if (error?.codigo) return res.status(409).json(failure(error.message, error.detalles))
      return next(error)
    }
  },

  /** PATCH /api/cuidado/sesiones/:id/estado — realizada o cancelada. */
  async cambiarEstado(req, res, next) {
    try {
      const sesion = await cambiarEstadoSesionGrupal(req.params.id, req.validated.estado)
      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'sesion_grupal',
        entityId: sesion.id,
        after: { estado: sesion.status },
      })
      return res.json(ok({ id: sesion.id, estado: sesion.status }, 'Listo.'))
    } catch (error) {
      if (error?.codigo) return res.status(409).json(failure(error.message, error.detalles))
      return next(error)
    }
  },

  /** PATCH /api/cuidado/sesiones/:id/asistencia — quién estuvo. */
  async asistencia(req, res, next) {
    try {
      const total = await marcarAsistencia(req.params.id, req.validated.asistieron)
      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'sesion_grupal',
        entityId: req.params.id,
        after: { asistieron: req.validated.asistieron.length, invitados: total },
      })
      return res.json(ok({ invitados: total }, 'Asistencia registrada.'))
    } catch (error) {
      if (error?.codigo) return res.status(409).json(failure(error.message, error.detalles))
      return next(error)
    }
  },

  /**
   * PATCH /api/cuidado/supervisores/:id — coordinación marca (o desmarca) a
   * alguien como supervisor desde su ficha. Es la única puerta: quién puede
   * facilitar se sabe por el formulario de voluntarios y se cuadra por
   * WhatsApp; al profesional no se le pregunta desde el enlace del caso.
   */
  async supervisor(req, res, next) {
    try {
      const p = await marcarSupervisor(req.params.id, req.validated.disponible)
      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'profesional',
        entityId: p.id,
        after: { supervisorVolunteer: p.supervisorVolunteer },
      })
      return res.json(
        ok(p, p.supervisorVolunteer ? 'Queda ofrecido como supervisor.' : 'Ya no aparece como supervisor.'),
      )
    } catch (error) {
      return next(error)
    }
  },
}
