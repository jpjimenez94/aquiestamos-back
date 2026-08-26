import { TaskModel } from '../models/task.model.js'
import { TaskAssignmentModel } from '../models/taskAssignment.model.js'
import { CollaboratorModel } from '../models/collaborator.model.js'
import { ok, created } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { generarTokenAsignacion } from '../services/taskToken.service.js'
import { tareaAsignada } from '../notifications/eventos.js'

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
    priority: t.priority,
    priorityLegible: PRIORIDAD_LEGIBLE[t.priority] ?? t.priority,
    status: t.status,
    statusLegible: ESTADO_LEGIBLE[t.status] ?? t.status,
    notes: t.notes,
    createdByEmail: t.createdByEmail,
    totalAssignments: t._count?.assignments ?? t.assignments?.length ?? 0,
    assignments: t.assignments?.map(formatearAsignacion) ?? undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

function formatearAsignacion(a) {
  return {
    id: a.id,
    status: a.status,
    note: a.note,
    respondedAt: a.respondedAt,
    declineReason: a.declineReason,
    createdAt: a.createdAt,
    collaborator: a.collaborator
      ? {
          id: a.collaborator.id,
          fullName: a.collaborator.fullName,
          // phone omitted: habeas data rule — no phone numbers in email payloads
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
      const tarea = await TaskModel.create({
        area: input.area,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        priority: input.priority ?? 'MEDIA',
        notes: input.notes ?? null,
        createdByEmail: req.usuario?.email ?? null,
      })
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
      const actualizada = await TaskModel.update(req.params.id, {
        ...(input.area !== undefined ? { area: input.area } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      await registrar({ req, action: ACCION.EDITAR, entity: 'task', entityId: tarea.id })
      return res.json(ok(formatearTarea(actualizada)))
    } catch (error) { next(error) }
  },

  /** PATCH /api/tasks/:id/status */
  async changeStatus(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })
      const actualizada = await TaskModel.update(req.params.id, { status: req.validated.status })
      await registrar({ req, action: ACCION.EDITAR, entity: 'task', entityId: tarea.id, after: { status: req.validated.status } })
      return res.json(ok(formatearTarea(actualizada)))
    } catch (error) { next(error) }
  },

  /** DELETE /api/tasks/:id */
  async destroy(req, res, next) {
    try {
      const tarea = await TaskModel.findById(req.params.id)
      if (!tarea) return res.status(404).json({ success: false, message: 'Tarea no encontrada.' })
      await TaskModel.softDelete(req.params.id)
      await registrar({ req, action: ACCION.BORRAR, entity: 'task', entityId: req.params.id })
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

      // Verificar que no esté ya asignado
      const existente = await TaskAssignmentModel.findByTaskAndCollaborator(req.params.id, collaboratorId)
      if (existente) return res.status(409).json({ success: false, message: 'Este voluntario ya está asignado a esta tarea.' })

      // Crear la asignación con un token temporal; se reemplaza en el siguiente paso
      const tempToken = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const asignacion = await TaskAssignmentModel.create({
        taskId: req.params.id,
        collaboratorId,
        note: note ?? null,
        confirmToken: tempToken,
      })

      // Generar el token HMAC real con el ID ya conocido
      const token = generarTokenAsignacion(asignacion.id, collaboratorId, req.params.id)
      const asignacionActualizada = await TaskAssignmentModel.update(asignacion.id, { confirmToken: token })

      // Si la tarea sigue en BORRADOR, pasarla a ABIERTA
      if (tarea.status === 'BORRADOR') {
        await TaskModel.update(req.params.id, { status: 'ABIERTA' })
      }

      // Enviar email de invitación (sin teléfono — habeas data)
      await tareaAsignada({
        asignacion: asignacionActualizada,
        tarea,
        colaborador,
        ruta: `/turno/${token}`,
      })

      await registrar({ req, action: ACCION.CREAR, entity: 'task_assignment', entityId: asignacion.id })
      return res.status(201).json(created(
        formatearAsignacion({ ...asignacionActualizada, collaborator: colaborador }),
        'Voluntario asignado. Se le envió el email de invitación.',
      ))
    } catch (error) { next(error) }
  },

  /** PATCH /api/tasks/:taskId/assign/:assignmentId/status */
  async updateAssignmentStatus(req, res, next) {
    try {
      const asignacion = await TaskAssignmentModel.findById(req.params.assignmentId)
      if (!asignacion || asignacion.taskId !== req.params.taskId) {
        return res.status(404).json({ success: false, message: 'Asignación no encontrada.' })
      }
      const actualizada = await TaskAssignmentModel.update(req.params.assignmentId, { status: req.validated.status })
      await registrar({ req, action: ACCION.EDITAR, entity: 'task_assignment', entityId: asignacion.id })
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
      await registrar({ req, action: ACCION.BORRAR, entity: 'task_assignment', entityId: req.params.assignmentId })
      return res.json(ok(null, 'Asignación eliminada.'))
    } catch (error) { next(error) }
  },
}
