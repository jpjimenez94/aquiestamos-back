import { describe, it, expect } from 'vitest'
import {
  taskCreateSchema,
  taskUpdateSchema,
  taskStatusSchema,
  assignCollaboratorSchema,
  taskConfirmationSchema,
} from '../src/validators/task.schema.js'
import { generarTokenAsignacion, verificarTokenAsignacion } from '../src/services/taskToken.service.js'

describe('validador de tareas internas', () => {
  it('valida una tarea correcta con todos los campos', () => {
    const r = taskCreateSchema.safeParse({
      area: 'COMUNICACION_TECNOLOGIA',
      title: 'Diseñar piezas para Instagram',
      description: 'Crear 3 artes para campaña de septiembre',
      dueDate: '2026-09-15',
      priority: 'ALTA',
      notes: 'Usar colores corporativos',
    })
    expect(r.success).toBe(true)
    expect(r.data.title).toBe('Diseñar piezas para Instagram')
    expect(r.data.priority).toBe('ALTA')
  })

  it('rechaza tareas con títulos demasiado cortos o áreas inexistentes', () => {
    expect(taskCreateSchema.safeParse({ area: 'INEXISTENTE', title: 'Ok' }).success).toBe(false)
    expect(taskCreateSchema.safeParse({ area: 'SALUD', title: 'No' }).success).toBe(false)
  })

  it('valida asignación de voluntario', () => {
    const validUuid = '11111111-1111-4111-8111-111111111111'
    const r = assignCollaboratorSchema.safeParse({
      collaboratorId: validUuid,
      note: 'Por favor entregar antes del mediodía',
    })
    expect(r.success).toBe(true)
    expect(assignCollaboratorSchema.safeParse({ collaboratorId: 'no-uuid' }).success).toBe(false)
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

  it('rechaza tokens adulterados o inválidos', () => {
    expect(verificarTokenAsignacion('token-invalido')).toBeNull()
    expect(verificarTokenAsignacion('')).toBeNull()
  })
})
