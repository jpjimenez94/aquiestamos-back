import { TaskAssignmentModel } from '../models/taskAssignment.model.js'
import { TaskModel } from '../models/task.model.js'
import { verificarTokenAsignacion } from '../services/taskToken.service.js'
import { tareaRespondida, tareaCompletada } from '../notifications/eventos.js'
import { ok } from '../views/response.view.js'

const AREA_LEGIBLE = {
  SALUD: 'Salud y primeros auxilios',
  SOCIAL_LEGAL_EDUCATIVO: 'Social, legal y educativo',
  OPERACION_LOGISTICA: 'Operación y logística',
  COMUNICACION_TECNOLOGIA: 'Comunicación y tecnología',
  GESTION_PROYECTOS: 'Gestión y proyectos',
  OTRA: 'Otra área',
}

/** GET /api/turno-confirmacion/:token — el frontend muestra los datos de la tarea */
export async function obtenerDetallesAsignacion(req, res, next) {
  try {
    const { token } = req.params
    const payload = verificarTokenAsignacion(token)
    if (!payload) {
      return res.status(410).json({ success: false, message: 'Este enlace ya no es válido o venció.' })
    }

    const asignacion = await TaskAssignmentModel.findByToken(token)
    if (!asignacion) {
      return res.status(404).json({ success: false, message: 'No encontramos la asignación para este enlace.' })
    }

    const yaRespondio = ['ACEPTADO', 'RECHAZADO', 'EN_PROGRESO', 'COMPLETADO'].includes(asignacion.status)
    const aceptadoOEnProgreso = ['ACEPTADO', 'EN_PROGRESO', 'COMPLETADO'].includes(asignacion.status)

    return res.json(ok({
      yaRespondio,
      status: asignacion.status,
      colaboradorNombre: asignacion.collaborator.fullName,
      completionUrl: asignacion.completionUrl,
      completionNote: asignacion.completionNote,
      tarea: {
        id: asignacion.task.id,
        title: asignacion.task.title,
        description: asignacion.task.description,
        area: asignacion.task.area,
        areaLegible: AREA_LEGIBLE[asignacion.task.area] ?? asignacion.task.area,
        dueDate: asignacion.task.dueDate ? (asignacion.task.dueDate.toISOString?.().split('T')[0] ?? asignacion.task.dueDate) : null,
        startTime: asignacion.task.startTime ?? null,
        endTime: asignacion.task.endTime ?? null,
        // Los materiales solo se muestran al voluntario cuando ya aceptó
        materialsUrl: aceptadoOEnProgreso ? (asignacion.task.materialsUrl ?? null) : null,
        notes: asignacion.task.notes,
        priority: asignacion.task.priority,
      },
      note: asignacion.note,
    }))
  } catch (error) { next(error) }
}

/** POST /api/turno-confirmacion/:token — el voluntario acepta o rechaza */
export async function responderAsignacion(req, res, next) {
  try {
    const { token } = req.params
    const { accion, declineReason } = req.body

    if (!['ACEPTAR', 'RECHAZAR'].includes(accion)) {
      return res.status(400).json({ success: false, message: 'Acción inválida.' })
    }

    const payload = verificarTokenAsignacion(token)
    if (!payload) {
      return res.status(410).json({ success: false, message: 'Este enlace ya no es válido o venció.' })
    }

    const asignacion = await TaskAssignmentModel.findByToken(token)
    if (!asignacion) {
      return res.status(404).json({ success: false, message: 'No encontramos la asignación para este enlace.' })
    }

    if (['ACEPTADO', 'RECHAZADO'].includes(asignacion.status)) {
      return res.status(409).json({ success: false, message: 'Ya habías respondido a esta invitación.' })
    }

    const nuevoEstado = accion === 'ACEPTAR' ? 'ACEPTADO' : 'RECHAZADO'
    await TaskAssignmentModel.update(asignacion.id, {
      status: nuevoEstado,
      respondedAt: new Date(),
      declineReason: accion === 'RECHAZAR' ? (declineReason ?? null) : null,
    })

    if (nuevoEstado === 'ACEPTADO') {
      const tarea = await TaskModel.findById(asignacion.taskId)
      if (tarea && tarea.status === 'ABIERTA') {
        await TaskModel.update(tarea.id, { status: 'EN_PROGRESO' })
      }
    }

    await tareaRespondida({
      asignacion: { ...asignacion, status: nuevoEstado, declineReason: accion === 'RECHAZAR' ? (declineReason ?? null) : null },
      tarea: asignacion.task,
      colaborador: asignacion.collaborator,
    })

    const mensaje = accion === 'ACEPTAR'
      ? '¡Gracias! Le avisamos al equipo de coordinación que aceptaste.'
      : 'Entendido. Le avisamos al equipo que no puedes en este momento.'

    return res.json(ok({ status: nuevoEstado }, mensaje))
  } catch (error) { next(error) }
}

/** POST /api/turno-confirmacion/:token/completar — el voluntario marca la tarea como terminada */
export async function completarLaborVoluntario(req, res, next) {
  try {
    const { token } = req.params
    const { completionUrl, completionNote } = req.body

    const payload = verificarTokenAsignacion(token)
    if (!payload) {
      return res.status(410).json({ success: false, message: 'Este enlace ya no es válido o venció.' })
    }

    const asignacion = await TaskAssignmentModel.findByToken(token)
    if (!asignacion) {
      return res.status(404).json({ success: false, message: 'No encontramos la asignación para este enlace.' })
    }

    if (asignacion.status === 'COMPLETADO') {
      return res.status(409).json({ success: false, message: 'Esta labor ya fue marcada como completada.' })
    }

    const actualizada = await TaskAssignmentModel.update(asignacion.id, {
      status: 'COMPLETADO',
      completionUrl: completionUrl || null,
      completionNote: completionNote || null,
    })

    // Si la tarea estaba en progreso, marcarla como COMPLETADA si no quedan otras asignaciones pendientes
    const tarea = await TaskModel.findById(asignacion.taskId)
    if (tarea) {
      await TaskModel.update(tarea.id, { status: 'COMPLETADA' })
    }

    // Despachar agradecimiento al voluntario y aviso a coordinación
    await tareaCompletada({
      asignacion: actualizada,
      tarea: asignacion.task,
      colaborador: asignacion.collaborator,
      porVoluntario: true,
    })

    return res.json(ok({ status: 'COMPLETADO' }, '¡Excelente! Marcamos la labor como completada y le avisamos al equipo.'))
  } catch (error) { next(error) }
}
