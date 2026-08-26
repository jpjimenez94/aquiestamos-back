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

/**
 * Busca una asignación de forma resiliente:
 * 1. Primero busca el token exacto en la base de datos (funciona con tokens HMAC y cualquier enlace emitido).
 * 2. Si no coincide el string exacto, verifica la firma criptográfica y busca por el ID de la asignación.
 */
async function buscarAsignacionPorToken(token) {
  if (!token) return null

  // 1. Búsqueda directa en base de datos
  const porTokenDirecto = await TaskAssignmentModel.findByToken(token)
  if (porTokenDirecto) return porTokenDirecto

  // 2. Búsqueda por payload verificado
  const payload = verificarTokenAsignacion(token)
  if (payload?.sub) {
    const porId = await TaskAssignmentModel.findById(payload.sub)
    if (porId) return porId
  }

  return null
}

/** GET /api/turno-confirmacion/:token — el frontend muestra los datos de la tarea */
export async function obtenerDetallesAsignacion(req, res, next) {
  try {
    const { token } = req.params
    const asignacion = await buscarAsignacionPorToken(token)
    if (!asignacion) {
      return res.status(404).json({ success: false, message: 'No encontramos la asignación para este enlace o el turno ya venció.' })
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

    const asignacion = await buscarAsignacionPorToken(token)
    if (!asignacion) {
      return res.status(404).json({ success: false, message: 'No encontramos la asignación para este enlace.' })
    }

    if (['ACEPTADO', 'RECHAZADO', 'COMPLETADO'].includes(asignacion.status)) {
      return res.status(409).json({ success: false, message: 'Ya habías respondido a esta invitación.' })
    }

    let nuevoEstado = accion === 'ACEPTAR' ? 'ACEPTADO' : 'RECHAZADO'

    // Si acepta y ya estamos en el horario del turno o fecha límite, pasa a EN_PROGRESO
    if (nuevoEstado === 'ACEPTADO') {
      const now = new Date()
      const dueStr = asignacion.task.dueDate ? (asignacion.task.dueDate.toISOString?.().split('T')[0] ?? String(asignacion.task.dueDate).split('T')[0]) : null
      const horaInicio = asignacion.task.startTime

      if (dueStr) {
        const [hIni, mIni] = horaInicio ? horaInicio.split(':').map(Number) : [0, 0]
        const fechaIni = new Date(`${dueStr}T${String(hIni).padStart(2, '0')}:${String(mIni).padStart(2, '0')}:00`)
        if (now >= fechaIni) {
          nuevoEstado = 'EN_PROGRESO'
        }
      }
    }

    const actualizada = await TaskAssignmentModel.update(asignacion.id, {
      status: nuevoEstado,
      respondedAt: new Date(),
      declineReason: accion === 'RECHAZAR' ? (declineReason ?? null) : null,
    })

    // Actualizar estado general de la tarea
    if (['ACEPTADO', 'EN_PROGRESO'].includes(nuevoEstado)) {
      const tarea = await TaskModel.findById(asignacion.taskId)
      if (tarea && (tarea.status === 'BORRADOR' || tarea.status === 'ABIERTA')) {
        await TaskModel.update(tarea.id, { status: 'EN_PROGRESO' })
      }
    }

    // Notificar a coordinación
    await tareaRespondida({
      asignacion: { ...asignacion, status: nuevoEstado, declineReason: accion === 'RECHAZAR' ? (declineReason ?? null) : null },
      tarea: asignacion.task,
      colaborador: asignacion.collaborator,
    })

    const mensaje = accion === 'ACEPTAR'
      ? (nuevoEstado === 'EN_PROGRESO' ? '¡Gracias! Tu turno ha sido confirmado y está en progreso.' : '¡Gracias! Tu turno ha sido confirmado.')
      : 'Entendido. Le avisamos al equipo que no puedes en este momento.'

    return res.json(ok({ status: nuevoEstado }, mensaje))
  } catch (error) { next(error) }
}

/** POST /api/turno-confirmacion/:token/completar — el voluntario marca la tarea como terminada */
export async function completarLaborVoluntario(req, res, next) {
  try {
    const { token } = req.params
    const { completionUrl, completionNote } = req.body

    const asignacion = await buscarAsignacionPorToken(token)
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

    const tarea = await TaskModel.findById(asignacion.taskId)
    if (tarea) {
      await TaskModel.update(tarea.id, { status: 'COMPLETADA' })
    }

    await tareaCompletada({
      asignacion: actualizada,
      tarea: asignacion.task,
      colaborador: asignacion.collaborator,
      porVoluntario: true,
    })

    return res.json(ok({ status: 'COMPLETADO' }, '¡Excelente! Marcamos la labor como completada y le avisamos al equipo.'))
  } catch (error) { next(error) }
}
