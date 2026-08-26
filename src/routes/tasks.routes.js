import { Router } from 'express'
import { TaskController } from '../controllers/task.controller.js'
import {
  obtenerDetallesAsignacion,
  responderAsignacion,
  completarLaborVoluntario,
} from '../controllers/taskConfirmation.controller.js'
import { validateBody } from '../middlewares/validate.js'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import {
  taskCreateSchema,
  taskUpdateSchema,
  taskStatusSchema,
  assignCollaboratorSchema,
  reassignCollaboratorSchema,
  addNoteSchema,
  updateAssignmentStatusSchema,
  taskCompletionSchema,
} from '../validators/task.schema.js'

export const taskRoutes = Router()
export const taskConfirmationRoutes = Router()

// --- Portal (requiere autenticación) ---
taskRoutes.get('/', authenticate, authorize('tarea:leer'), TaskController.index)
taskRoutes.post('/', authenticate, authorize('tarea:crear'), validateBody(taskCreateSchema), TaskController.store)
taskRoutes.get('/:id', authenticate, authorize('tarea:leer'), TaskController.show)
taskRoutes.patch('/:id', authenticate, authorize('tarea:editar'), validateBody(taskUpdateSchema), TaskController.update)
taskRoutes.patch('/:id/status', authenticate, authorize('tarea:editar'), validateBody(taskStatusSchema), TaskController.changeStatus)
taskRoutes.post('/:id/notes', authenticate, authorize('tarea:editar'), validateBody(addNoteSchema), TaskController.addNote)
taskRoutes.delete('/:id', authenticate, authorize('tarea:editar'), TaskController.destroy)

// Asignaciones y Reasignación
taskRoutes.post('/:id/assign', authenticate, authorize('tarea:asignar'), validateBody(assignCollaboratorSchema), TaskController.assign)
taskRoutes.post('/:id/reassign', authenticate, authorize('tarea:asignar'), validateBody(reassignCollaboratorSchema), TaskController.reassign)
taskRoutes.patch('/:taskId/assign/:assignmentId/status', authenticate, authorize('tarea:asignar'), validateBody(updateAssignmentStatusSchema), TaskController.updateAssignmentStatus)
taskRoutes.delete('/:taskId/assign/:assignmentId', authenticate, authorize('tarea:asignar'), TaskController.removeAssignment)

// --- Público: el voluntario confirma, rechaza o completa desde su email ---
taskConfirmationRoutes.get('/:token', obtenerDetallesAsignacion)
taskConfirmationRoutes.post('/:token', responderAsignacion)
taskConfirmationRoutes.post('/:token/completar', validateBody(taskCompletionSchema), completarLaborVoluntario)
