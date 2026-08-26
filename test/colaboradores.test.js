import { describe, it, expect } from 'vitest'
import {
  collaboratorCreateSchema,
  DISCIPLINAS,
  AREAS,
} from '../src/validators/collaborator.schema.js'

/**
 * Formulario "Quiero apoyar": el voluntariado de otras disciplinas.
 *
 * Lo que más se cuida aquí es que el área y la disciplina no puedan
 * divergir. El directorio existe para buscar por área; si se pudiera guardar
 * "Cocina" dentro de "Salud", dejaría de servir justo para eso.
 */

const base = {
  fullName: 'Camila Restrepo',
  phone: '3145558899',
  email: 'Camila.Restrepo@Ejemplo.com',
  city: 'Ibagué',
  area: 'OPERACION_LOGISTICA',
  discipline: 'Logística',
  modality: 'VIRTUAL',
  availableDays: ['LUNES', 'MIERCOLES'],
  availableSlots: ['TARDE'],
  weeklyHours: 'ENTRE_4_Y_6',
  consentVersion: '2026-08',
  dataConsent: true,
}

describe('formulario de voluntariado de apoyo', () => {
  it('acepta un envío completo y normaliza el correo', () => {
    const r = collaboratorCreateSchema.safeParse(base)
    expect(r.success).toBe(true)
    expect(r.data.email).toBe('camila.restrepo@ejemplo.com')
  })

  it('rechaza una disciplina que no pertenece al área', () => {
    const r = collaboratorCreateSchema.safeParse({
      ...base,
      area: 'SALUD',
      discipline: 'Cocina y alimentación',
    })
    expect(r.success).toBe(false)
    expect(r.error.issues.some((i) => i.path[0] === 'discipline')).toBe(true)
  })

  it('exige decir cuál cuando se elige "Otra"', () => {
    const sinDecir = collaboratorCreateSchema.safeParse({
      ...base,
      discipline: 'Otra',
    })
    expect(sinDecir.success).toBe(false)
    expect(sinDecir.error.issues.some((i) => i.path[0] === 'disciplineOther')).toBe(true)

    const diciendo = collaboratorCreateSchema.safeParse({
      ...base,
      discipline: 'Otra',
      disciplineOther: 'Veterinaria',
    })
    expect(diciendo.success).toBe(true)
  })

  it('exige día, franja y horas: es lo que permite saber a quién llamar', () => {
    expect(collaboratorCreateSchema.safeParse({ ...base, availableDays: [] }).success).toBe(false)
    expect(collaboratorCreateSchema.safeParse({ ...base, availableSlots: [] }).success).toBe(false)
    expect(collaboratorCreateSchema.safeParse({ ...base, weeklyHours: '' }).success).toBe(false)
  })

  it('trata como "sin responder" las preguntas opcionales vacías', () => {
    const r = collaboratorCreateSchema.safeParse({
      ...base,
      yearsExperience: '',
      professionalCard: '',
      yellowFeverVaccine: '',
    })
    expect(r.success).toBe(true)
    expect(r.data.yearsExperience).toBeUndefined()
    expect(r.data.professionalCard).toBeUndefined()
  })

  it('si puede ir presencial, exige la vacuna y su autorización expresa', () => {
    const presencial = { ...base, modality: 'PRESENCIAL' }

    const sinVacuna = collaboratorCreateSchema.safeParse(presencial)
    expect(sinVacuna.success).toBe(false)
    expect(sinVacuna.error.issues.some((i) => i.path[0] === 'yellowFeverVaccine')).toBe(true)

    const sinAutorizacion = collaboratorCreateSchema.safeParse({
      ...presencial,
      yellowFeverVaccine: 'SI',
      sensitiveDataConsent: false,
    })
    expect(sinAutorizacion.success).toBe(false)
    expect(sinAutorizacion.error.issues.some((i) => i.path[0] === 'sensitiveDataConsent')).toBe(true)

    const completo = collaboratorCreateSchema.safeParse({
      ...presencial,
      yellowFeverVaccine: 'SI',
      sensitiveDataConsent: true,
    })
    expect(completo.success).toBe(true)
  })

  it('sin autorización de datos no se guarda nada', () => {
    const r = collaboratorCreateSchema.safeParse({ ...base, dataConsent: false })
    expect(r.success).toBe(false)
    expect(r.error.issues.some((i) => i.path[0] === 'dataConsent')).toBe(true)
  })

  it('acepta celulares de otros países', () => {
    for (const phone of ['+34 600 123 456', '+1 (415) 555-2671', '3145558899']) {
      expect(collaboratorCreateSchema.safeParse({ ...base, phone }).success).toBe(true)
    }
    expect(collaboratorCreateSchema.safeParse({ ...base, phone: 'no tengo' }).success).toBe(false)
  })

  it('todas las áreas tienen disciplinas y todas ofrecen "Otra"', () => {
    // Si un área se quedara sin "Otra", quien no encuentre su oficio no
    // podría registrarse.
    for (const area of AREAS) {
      expect(DISCIPLINAS[area].length).toBeGreaterThan(0)
      expect(DISCIPLINAS[area]).toContain('Otra')
    }
  })

  it('valida actualización parcial de colaborador', async () => {
    const { collaboratorUpdateSchema } = await import('../src/validators/collaborator.schema.js')
    const r = collaboratorUpdateSchema.safeParse({
      phone: '3109998877',
      status: 'ACTIVO',
      city: 'Medellín',
    })
    expect(r.success).toBe(true)
    expect(r.data.status).toBe('ACTIVO')
  })
})
