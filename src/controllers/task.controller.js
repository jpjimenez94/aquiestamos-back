import { TaskModel } from '../models/task.model.js'
import { TaskAssignmentModel } from '../models/taskAssignment.model.js'
import { CollaboratorModel } from '../models/collaborator.model.js'
import { ok, created } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { generarTokenAsignacion } from '../services/taskToken.service.js'
import { tareaAsignada, tareaCompletada } from '../notifications/eventos.js'

const AREA_LEGIBLE = {
  SALUD: 'Salud y primeros auxilios',
  SOCIAL_LEGAL_EDUCATIVO: 'Social, legal y educativo',
  OPERACION_LOGISTICA: 'Operación y logística',
  COMUNICACION_TECNOLOGIA: 'Comunicación y tecnología',
  GESTION_PROYECTOS: 'Gestión y proyectos',
  OTRA: 'Otra área',
}

const PRIORIDAD_LEGIBLE = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta' }
const ESTADO_LEGIBLE = {
  BORRADOR: 'Borrador', ABIERTA: 'Abierta', EN_PROGRESO: 'En progreso',
  COMPLETADA: 'Completada', CANCELADA: 'Cancelada',
}

function formatearTarea(t) {
  return {
    id: t.id,
    area: t.area,
    areaLegible: AREA_LEGIBLE[t.area] ?? t.area,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate ? t.dueDate.toISOString().split('T')[0] : null,
    startTime: t.startTime,
    endTime: t.endTime,
    materialsUrl: t.materialsUrl,
    priority: t.priority,
    priorityLegible: PRIORIDAD_LEGIBLE[t.priority] ?? t.priority,
    status: t.status,
    statusLegible: ESTADO_LEGIBLE[t.status] ?? t.status,
    notes: t.notes,
    createdByEmail: t.createdByEmail,
    totalAssignments: t._count?.assignments ?? t.assignments?.length ?? 0,
    assignments: t.assignments?.map((a) => formatearAsignacion(a, t)) ?? undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

function calcularEstadoDinamico(a, taskDueDate, taskStartTime, taskEndTime) {
  if (['COMPLETADO', 'RECHAZADO'].includes(a.status)) return a.status
  const now = new Date()
  if (taskDueDate) {
    const dueStr = taskDueDate instanceof Date ? taskDueDate.toISOString().split('T')[0] : String(taskDueDate).split('T')[0]
    const [hFin, mFin] = taskEndTime ? taskEndTime.split(':').map(Number) : [23, 59]
    const [hIni, mIni] = taskStartTime ? taskStartTime.split(':').map(Number) : [0, 0]
    const fechaFin = new Date(`${dueStr}T${String(hFin).padStart(2, '0')}:${String(mFin).padStart(2, '0')}:00`)
    const fechaIni = new Date(`${dueStr}T${String(hIni).padStart(2, '0')}:${String(mIni).padStart(2, '0')}:00`)

    if (a.status === 'INVITADO') {
      if (now > fechaFin) return 'NO_RESPONDIO'
      return 'INVITADO'
    }

    if (a.status === 'ACEPTADO' || a.status === 'EN_PROGRESO') {
      if (now >= fechaIni) return 'EN_PROGRESO'
      return 'ACEPTADO'
    }
  }
  return a.status
}

function formatearAsignacion(a, tareaPadre)
  return {
    id: a.id,
    status: tareaPadre ? calcularEstadoDinamico(a, tareaPadre.dueDate, tareaPadre.startTime, tareaPadre.endTime) : a.status,
    note: a.note,
    confirmToken: a.confirmToken,
    respondedAt: a.respondedAt,
    declineReason: a.declineReason,
    completionUrl: a.completionUrl,
    completionNote: a.completionNote,
    createdAt: a.createdAt,
    collaborator: a.collaborator
      ? {
          id: a.collaborator.id,
          fullName: a.collaborator.fullName,
          phone: a.collaborator.phone,
          email: a.collaborator.email,
          area: a.collaborator.area,
          areaLegible: AREA_LEGIBLE[a.collaborator.area] ?? a.collaborator.area,
          discipline: a.collaborator.discipline,
          availableDays: a.collaborator.availableDays,
          availableSlots: a.collaborator.availableSlots,
        }
      : undefined,
  }
}

export const TaskController = {
  /** GET /api/tasks */
  async index(req, res, next) {
    try {
      const { area, status, priority } = req.query
      const filtros = {
        area: area || undefined,
        status: status || undefined,
        priority: priority || undefined,
      }
      const [tareas, total] = await Promise.all([
        TaskModel.findAll(filtros),
        TaskModel.count(filtros),
      ])
      return res.json(ok(tareas.map(formatearTarea), { total }))
    } catch (error) { next(error) }
  },

  /** POST /api/tasks */
  async store(req, res, next) {
    try {
      const input = req.validated
      const estadoInicial = input.collaboratorId ? 'ABIERTA' : 'BORRADOR'

      let tarea = await TaskModel.create({
        area: input.area,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        materialsUrl: input.materialsUrl || null,
        priority: input.priority ?? 'MEDIA',
        status: estadoInicial,
        notes: input.notes ?? null,
        createdByEmail: req.usuario?.email ?? null,
      })

      // Asignar de una vez si se seleccionó voluntario
      if (input.collaboratorId) {
        const colaborador = await CollaboratorModel.findById(input.collaboratorId)
        if (colaborador) {
          const token = generarTokenAsignacion()
          const asignacion = await TaskAssignmentModel.create({
            taskId: tarea.id,
            collaboratorId: input.collaboratorId,
            note: input.assignmentNote ?? null,
            confirmToken: token,
          })

          await tareaAsignada({
            asignacion,
            tarea,
            colaborador,
            ruta: '/turno/' + token,
          })

          await registrar({ req, action: ACCION.CREAR, entity: 'task_assignment', entityId: asignacion.id })
          tarea = await TaskModel.findById(tarea.id)
        }
      }

      await registrar({ req, action: ACCION.CREAR, entity: 'task', entityId: tarea.id })
      return res.status(201).json(created(formatearTarea(tarea), 'Tarea creada.'))
    } catch (error) { next(error) }
  },

  /** GET /api/tasks/:id */
  async show(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })
      return res.json(ok(formatearTarea(tarea)))
    } catch (error) { next(error) }
  },

  /** PATCH /api/tasks/:id */
  async update(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })
      const input = req.validated
      await TaskModel.update(req.params.id, {
        ...(input.area !== undefined ? { area: input.area } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.materialsUrl !== undefined ? { materialsUrl: input.materialsUrl || null } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      await registrar({ req, action: ACCION.EDITAR, entity: 'task', entityId: tarea.id })
      const tareaCompleta = await TaskModel.findById(req.params.id)
      return res.json(ok(formatearTarea(tareaCompleta), 'Tarea actualizada.'))
    } catch (error) { next(error) }
  },

  /** PATCH /api/tasks/:id/status */
  async changeStatus(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })
      await TaskModel.update(req.params.id, { status: req.validated.status })
      await registrar({ req, action: ACCION.EDITAR, entity: 'task', entityId: tarea.id, after: { status: req.validated.status } })
      const tareaCompleta = await TaskModel.findById(req.params.id)
      return res.json(ok(formatearTarea(tareaCompleta)))
    } catch (error) { next(error) }
  },

  /** POST /api/tasks/:id/notes */
  async addNote(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })

      const { note } = req.validated
      const ahora = new Date()
      const fechaStr = ahora.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const autor = req.usuario?.name || req.usuario?.email || 'Coordinación'
      const nuevaEntrada = '[' + fechaStr + ' · ' + autor + ']: ' + note
      const notasActuales = tarea.notes ? tarea.notes + '\n\n' + nuevaEntrada : nuevaEntrada

      await TaskModel.update(req.params.id, { notes: notasActuales })
      await registrar({ req, action: ACCION.EDITAR, entity: 'task', entityId: tarea.id, after: { nuevaNota: note } })
      const tareaCompleta = await TaskModel.findById(req.params.id)
      return res.json(ok(formatearTarea(tareaCompleta), 'Nota agregada.'))
    } catch (error) { next(error) }
  },

  /** DELETE /api/tasks/:id */
  async destroy(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })
      await TaskModel.softDelete(req.params.id)
      await registrar({ req, action: ACCION.ELIMINAR, entity: 'task', entityId: req.params.id })
      return res.json(ok(null, 'Tarea eliminada.'))
    } catch (error) { next(error) }
  },

  /** POST /api/tasks/:id/assign */
  async assign(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })

      const { collaboratorId, note } = req.validated
      const colaborador = await CollaboratorModel.findById(collaboratorId)
      if (!colaborador) return res.status(404).json({ success: false, message: 'Voluntario no encontrado.' })

      const existente = await TaskAssignmentModel.findByTaskAndCollaborator(req.params.id, collaboratorId)
      if (existente) return res.status(409).json({ success: false, message: 'Este voluntario ya está asignado a esta tarea.' })

      const token = generarTokenAsignacion()
      const asignacion = await TaskAssignmentModel.create({
        taskId: req.params.id,
        collaboratorId,
        note: note ?? null,
        confirmToken: token,
      })

      if (tarea.status === 'BORRADOR') {
        await TaskModel.update(req.params.id, { status: 'ABIERTA' })
      }

      await tareaAsignada({
        asignacion,
        tarea,
        colaborador,
        ruta: '/turno/' + token,
      })

      await registrar({ req, action: ACCION.CREAR, entity: 'task_assignment', entityId: asignacion.id })
      return res.status(201).json(created(formatearAsignacion({ ...asignacionActualizada, collaborator: colaborador }), 'Voluntario asignado. Se le envió el email de invitación.'))
    } catch (error) { next(error) }
  },

  /** POST /api/tasks/:id/reassign */
  async reassign(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })

      const { newCollaboratorId, note } = req.validated
      const nuevoColaborador = await CollaboratorModel.findById(newCollaboratorId)
      if (!nuevoColaborador) return res.status(404).json({ success: false, message: 'Voluntario no encontrado.' })

      for (const a of tarea.assignments ?? []) {
        await TaskAssignmentModel.delete(a.id).catch(() => null)
      }

      const tempToken = 'temp-' + Date.now()
      const asignacion = await TaskAssignmentModel.create({
        taskId: req.params.id,
        collaboratorId: newCollaboratorId,
        note: note ?? null,
        confirmToken: tempToken,
      })

      const token = generarTokenAsignacion(asignacion.id, newCollaboratorId, req.params.id)
      const asignacionActualizada = await TaskAssignmentModel.update(asignacion.id, { confirmToken: token })

      await TaskModel.update(req.params.id, { status: 'ABIERTA' })

      await tareaAsignada({
        asignacion: asignacionActualizada,
        tarea,
        colaborador: nuevoColaborador,
        ruta: '/turno/' + token,
      })

      await registrar({ req, action: ACCION.EDITAR, entity: 'task', entityId: tarea.id, after: { reasignadoA: newCollaboratorId } })
      const tareaCompleta = await TaskModel.findById(req.params.id)
      return res.json(ok(formatearTarea(tareaCompleta), 'Tarea reasignada. Se envió la nueva invitación por correo.'))
    } catch (error) { next(error) }
  },

  /** PATCH /api/tasks/:taskId/assign/:assignmentId/status */
  async updateAssignmentStatus(req, res, next) {
    try {
      const asignacion = await TaskAssignmentModel.findById(req.params.assignmentId)
      if (!asignacion || asignacion.taskId !== req.params.taskId) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada.' })
      }
      const nuevoEstado = req.validated.status
      const actualizada = await TaskAssignmentModel.update(req.params.assignmentId, { status: nuevoEstado })

      // Si se marca como COMPLETADO desde el portal, enviar email de agradecimiento
      if (nuevoEstado === 'COMPLETADO' && asignacion.collaborator) {
        await tareaCompletada({
          asignacion: actualizada,
          tarea: asignacion.task,
          colaborador: asignacion.collaborator,
          porVoluntario: false,
        }).catch((err) => console.error('[tasks] error enviando agradecimiento:', err))
      }

      await registrar({ req, action: ACCION.EDITAR, entity: 'task_assignment', entityId: asignacion.id, after: { status: nuevoEstado } })
      return res.json(ok(formatearAsignacion(actualizada)))
    } catch (error) { next(error) }
  },

  /** DELETE /api/tasks/:taskId/assign/:assignmentId */
  async removeAssignment(req, res, next) {
    try {
      const asignacion = await TaskAssignmentModel.findById(req.params.assignmentId)
      if (!asignacion || asignacion.taskId !== req.params.taskId) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada.' })
      }
      await TaskAssignmentModel.delete(req.params.assignmentId)
      await registrar({ req, action: ACCION.ELIMINAR, entity: 'task_assignment', entityId: req.params.assignmentId })
      return res.json(ok(null, 'Asignación eliminada.'))
    } catch (error) { next(error) }
  },
}
