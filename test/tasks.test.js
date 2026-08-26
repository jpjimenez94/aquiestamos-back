import { describe, it, expect } from 'vitest'
import {
  taskCreateSchema,
  taskUpdateSchema,
  taskStatusSchema,
  assignCollaboratorSchema,
  reassignCollaboratorSchema,
  addNoteSchema,
  taskConfirmationSchema,
} from '../src/validators/task.schema.js'
import { generarTokenAsignacion, verificarTokenAsignacion } from '../src/services/taskToken.service.js'

describe('validador de tareas internas', () => {
  it('valida una tarea correcta con horarios y asignación inicial', () => {
    const validUuid = '11111111-1111-4111-8111-111111111111'
    const r = taskCreateSchema.safeParse({
      area: 'COMUNICACION_TECNOLOGIA',
      title: 'Diseñar piezas para Instagram',
      description: 'Crear 3 artes para campaña de septiembre',
      dueDate: '2026-09-15',
      startTime: '08:30',
      endTime: '12:00',
      priority: 'ALTA',
      notes: 'Usar colores corporativos',
      collaboratorId: validUuid,
      assignmentNote: 'Favor revisar el manual de marca',
    })
    expect(r.success).toBe(true)
    expect(r.data.title).toBe('Diseñar piezas para Instagram')
    expect(r.data.startTime).toBe('08:30')
    expect(r.data.endTime).toBe('12:00')
    expect(r.data.collaboratorId).toBe(validUuid)
  })

  it('valida reasignación de voluntario', () => {
    const validUuid = '22222222-2222-4222-8222-222222222222'
    const r = reassignCollaboratorSchema.safeParse({
      newCollaboratorId: validUuid,
      note: 'Reasignada por cambio de disponibilidad',
    })
    expect(r.success).toBe(true)
    expect(reassignCollaboratorSchema.safeParse({ newCollaboratorId: 'invalido' }).success).toBe(false)
  })

  it('valida agregar nota a la tarea', () => {
    expect(addNoteSchema.safeParse({ note: 'Se envió material por Drive' }).success).toBe(true)
    expect(addNoteSchema.safeParse({ note: '' }).success).toBe(false)
  })

  it('valida respuesta de confirmación pública', () => {
    expect(taskConfirmationSchema.safeParse({ accion: 'ACEPTAR' }).success).toBe(true)
    expect(taskConfirmationSchema.safeParse({ accion: 'RECHAZAR', declineReason: 'No tengo tiempo' }).success).toBe(true)
    expect(taskConfirmationSchema.safeParse({ accion: 'OTRA' }).success).toBe(false)
  })
})

describe('servicio de tokens de confirmación de tareas', () => {
  it('genera y verifica un token válido', () => {
    const assignmentId = 'assign-123'
    const collaboratorId = 'colab-456'
    const taskId = 'task-789'

    const token = generarTokenAsignacion(assignmentId, collaboratorId, taskId)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)

    const payload = verificarTokenAsignacion(token)
    expect(payload).not.toBeNull()
    expect(payload.sub).toBe(assignmentId)
    expect(payload.cid).toBe(collaboratorId)
    expect(payload.tid).toBe(taskId)
    expect(payload.tipo).toBe('task-confirm')
  })
})
