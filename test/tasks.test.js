import { describe, it, expect } from 'vitest'
import {
  taskCreateSchema,
  taskUpdateSchema,
  taskStatusSchema,
  assignCollaboratorSchema,
  reassignCollaboratorSchema,
  addNoteSchema,
  taskConfirmationSchema,
  taskCompletionSchema,
} from '../src/validators/task.schema.js'
import { generarTokenAsignacion, verificarTokenAsignacion } from '../src/services/taskToken.service.js'

describe('validador de tareas internas', () => {
  it('valida una tarea con materialsUrl y horarios', () => {
    const validUuid = '11111111-1111-4111-8111-111111111111'
    const r = taskCreateSchema.safeParse({
      area: 'COMUNICACION_TECNOLOGIA',
      title: 'Diseñar piezas para Instagram',
      description: 'Crear 3 artes para campaña de septiembre',
      dueDate: '2026-09-15',
      startTime: '08:30',
      endTime: '12:00',
      materialsUrl: 'https://drive.google.com/drive/folders/test1234',
      priority: 'ALTA',
      notes: 'Usar colores corporativos',
      collaboratorId: validUuid,
      assignmentNote: 'Favor revisar el manual de marca',
    })
    expect(r.success).toBe(true)
    expect(r.data.materialsUrl).toBe('https://drive.google.com/drive/folders/test1234')
  })

  it('valida reporte de entrega del voluntario', () => {
    expect(taskCompletionSchema.safeParse({
      completionUrl: 'https://drive.google.com/artes-finales',
      completionNote: 'Entregados 3 archivos png',
    }).success).toBe(true)

    expect(taskCompletionSchema.safeParse({
      completionUrl: '',
      completionNote: 'Trabajo terminado en la plataforma',
    }).success).toBe(true)
  })

  it('valida reasignación de voluntario', () => {
    const validUuid = '22222222-2222-4222-8222-222222222222'
    const r = reassignCollaboratorSchema.safeParse({
      newCollaboratorId: validUuid,
      note: 'Reasignada por cambio de disponibilidad',
    })
    expect(r.success).toBe(true)
  })

  it('valida agregar nota a la tarea', () => {
    expect(addNoteSchema.safeParse({ note: 'Se envió material por Drive' }).success).toBe(true)
  })

  it('valida respuesta de confirmación pública', () => {
    expect(taskConfirmationSchema.safeParse({ accion: 'ACEPTAR' }).success).toBe(true)
    expect(taskConfirmationSchema.safeParse({ accion: 'RECHAZAR', declineReason: 'No tengo tiempo' }).success).toBe(true)
  })
})

describe('servicio de tokens de confirmación de tareas', () => {
  it('genera un token corto válido de 24 caracteres', () => {
    const token = generarTokenAsignacion()
    expect(typeof token).toBe('string')
    expect(token).toHaveLength(24)
    expect(/^[0-9a-f]{24}$/.test(token)).toBe(true)
  })
})
