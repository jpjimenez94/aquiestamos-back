import { describe, it, expect } from 'vitest'
import { volunteerCreateSchema } from '../src/validators/volunteer.schema.js'
import { supportRequestCreateSchema } from '../src/validators/supportRequest.schema.js'
import { loginSchema, crearUsuarioSchema } from '../src/validators/auth.schema.js'
import { limpiar } from '../src/services/audit.service.js'
import { VERSION_ACTUAL, esVersionValida } from '../src/consent/versions.js'

const voluntarioBase = {
  fullName: 'Ana María Ruiz',
  phone: '3001234567',
  email: 'Ana.Ruiz@Ejemplo.COM',
  city: 'Bogotá',
  profession: 'Psicóloga clínica',
  yearsExperience: 'ENTRE_3_Y_5',
  professionalCard: 'SI',
  populations: ['Niños y niñas', 'Familias'],
  crisisExperience: 'SI',
  modality: 'VIRTUAL',
  availableDays: ['MARTES', 'JUEVES'],
  availableSlots: ['TARDE'],
  weeklyHours: 'ENTRE_1_Y_3',
  consentVersion: VERSION_ACTUAL,
  dataConsent: true,
}

describe('formulario de profesionales', () => {
  it('acepta un envío virtual sin datos de salud', () => {
    const r = volunteerCreateSchema.safeParse(voluntarioBase)
    expect(r.success).toBe(true)
    expect(r.data.email).toBe('ana.ruiz@ejemplo.com')
  })

  it('exige día y franja, que son lo que alimenta la agenda', () => {
    expect(volunteerCreateSchema.safeParse({ ...voluntarioBase, availableDays: [] }).success).toBe(false)
    expect(volunteerCreateSchema.safeParse({ ...voluntarioBase, availableSlots: [] }).success).toBe(false)
  })

  // A quien acompaña solo virtual no se le pregunta por la vacuna, así que el
  // formulario manda ''. Eso es "no se preguntó", no un valor inválido: si se
  // tratara como inválido, el envío fallaría señalando una pregunta oculta.
  it('acepta la vacuna vacía cuando el acompañamiento es virtual', () => {
    const r = volunteerCreateSchema.safeParse({ ...voluntarioBase, yellowFeverVaccine: '' })
    expect(r.success).toBe(true)
    expect(r.data.yellowFeverVaccine).toBeUndefined()
  })

  it('si es presencial, exige la vacuna', () => {
    const sinVacuna = volunteerCreateSchema.safeParse({
      ...voluntarioBase,
      modality: 'PRESENCIAL',
      sensitiveDataConsent: true,
    })
    expect(sinVacuna.success).toBe(false)
    expect(sinVacuna.error.issues.some((i) => i.path[0] === 'yellowFeverVaccine')).toBe(true)
  })

  it('no guarda el dato de vacunación sin su autorización expresa', () => {
    const sinAutorizacion = volunteerCreateSchema.safeParse({
      ...voluntarioBase,
      modality: 'PRESENCIAL',
      yellowFeverVaccine: 'SI',
      sensitiveDataConsent: false,
    })
    expect(sinAutorizacion.success).toBe(false)
    expect(sinAutorizacion.error.issues.some((i) => i.path[0] === 'sensitiveDataConsent')).toBe(true)

    const conAutorizacion = volunteerCreateSchema.safeParse({
      ...voluntarioBase,
      modality: 'PRESENCIAL',
      yellowFeverVaccine: 'SI',
      sensitiveDataConsent: true,
    })
    expect(conAutorizacion.success).toBe(true)
  })

  it('si es virtual, no hace falta autorización de datos sensibles', () => {
    const r = volunteerCreateSchema.safeParse({ ...voluntarioBase, sensitiveDataConsent: false })
    expect(r.success).toBe(true)
  })

  it('marcar "Otra" población obliga a decir cuál', () => {
    const conOtra = { ...voluntarioBase, populations: ['Familias', 'Otra'] }
    expect(volunteerCreateSchema.safeParse(conOtra).success).toBe(false)
    expect(
      volunteerCreateSchema.safeParse({ ...conOtra, populationOther: 'Personas sordas' }).success,
    ).toBe(true)
  })

  it('rechaza una versión de consentimiento desconocida', () => {
    expect(volunteerCreateSchema.safeParse({ ...voluntarioBase, consentVersion: '1999-01' }).success).toBe(false)
  })

  it('los mensajes de error están en español', () => {
    const r = volunteerCreateSchema.safeParse({})
    const mensajes = r.error.issues.map((i) => i.message)
    expect(mensajes).toContain('Campo obligatorio')
    expect(mensajes.every((m) => m !== 'Required')).toBe(true)
  })
})

const solicitudBase = {
  forWhom: 'PARA_MI',
  name: 'Luis Herrera',
  phone: '3007654321',
  preferredContact: 'WHATSAPP',
  city: 'Manizales',
  preferredModality: 'VIRTUAL',
  availableDays: ['JUEVES'],
  availableSlots: ['TARDE'],
  consentVersion: VERSION_ACTUAL,
  dataConsent: true,
  sensitiveDataConsent: true,
}

describe('formulario de atención', () => {
  it('acepta un envío sin correo', () => {
    expect(supportRequestCreateSchema.safeParse(solicitudBase).success).toBe(true)
    expect(supportRequestCreateSchema.safeParse({ ...solicitudBase, email: '' }).success).toBe(true)
  })

  it('exige correo solo si eligió el correo como canal', () => {
    const porCorreo = { ...solicitudBase, preferredContact: 'CORREO' }
    expect(supportRequestCreateSchema.safeParse(porCorreo).success).toBe(false)
    expect(
      supportRequestCreateSchema.safeParse({ ...porCorreo, email: 'luis@ejemplo.com' }).success,
    ).toBe(true)
  })

  it('exige la autorización expresa de datos sensibles', () => {
    const r = supportRequestCreateSchema.safeParse({ ...solicitudBase, sensitiveDataConsent: false })
    expect(r.success).toBe(false)
    expect(r.error.issues.some((i) => i.path[0] === 'sensitiveDataConsent')).toBe(true)
  })

  it('si es para otra persona, pide saber si es menor y quién llama', () => {
    const paraOtra = { ...solicitudBase, forWhom: 'PARA_OTRA_PERSONA' }
    const r = supportRequestCreateSchema.safeParse(paraOtra)
    expect(r.success).toBe(false)
    const campos = r.error.issues.map((i) => i.path[0])
    expect(campos).toContain('isMinor')
    expect(campos).toContain('contactName')
  })

  it('si es para un menor, exige la autorización del representante legal', () => {
    const menor = {
      ...solicitudBase,
      forWhom: 'PARA_OTRA_PERSONA',
      isMinor: true,
      contactName: 'Marta Ruiz',
    }
    const sinRepresentante = supportRequestCreateSchema.safeParse(menor)
    expect(sinRepresentante.success).toBe(false)
    expect(sinRepresentante.error.issues.some((i) => i.path[0] === 'guardianConsent')).toBe(true)

    expect(supportRequestCreateSchema.safeParse({ ...menor, guardianConsent: true }).success).toBe(true)
  })

  it('no exige representante si la persona es mayor de edad', () => {
    const mayor = {
      ...solicitudBase,
      forWhom: 'PARA_OTRA_PERSONA',
      isMinor: false,
      contactName: 'Marta Ruiz',
    }
    expect(supportRequestCreateSchema.safeParse(mayor).success).toBe(true)
  })

  // El formulario dejó de preguntar cuándo le viene bien: eso se acuerda en
  // la primera llamada. Lo que NO puede pasar es que el select vacío ('')
  // haga fallar un envío señalando una pregunta que ya no existe.
  it('acepta que no haya disponibilidad ni modalidad', () => {
    expect(supportRequestCreateSchema.safeParse({ ...solicitudBase, availableDays: [] }).success).toBe(true)
    expect(supportRequestCreateSchema.safeParse({ ...solicitudBase, availableSlots: [] }).success).toBe(true)

    const r = supportRequestCreateSchema.safeParse({ ...solicitudBase, preferredModality: '' })
    expect(r.success).toBe(true)
    expect(r.data.preferredModality).toBeUndefined()
  })
})

describe('versiones del consentimiento', () => {
  it('reconoce la versión vigente y rechaza las inventadas', () => {
    expect(esVersionValida(VERSION_ACTUAL)).toBe(true)
    expect(esVersionValida('2020-01')).toBe(false)
    expect(esVersionValida(undefined)).toBe(false)
  })
})

describe('formularios del portal', () => {
  it('el login normaliza el correo a minúsculas', () => {
    const r = loginSchema.safeParse({ email: '  ADMIN@Ejemplo.com ', password: 'x' })
    expect(r.success).toBe(true)
    expect(r.data.email).toBe('admin@ejemplo.com')
  })

  it('crear usuario exige un rol conocido y clave fuerte', () => {
    const base = { email: 'a@b.co', name: 'Alguien', password: 'clavevalida123' }
    expect(crearUsuarioSchema.safeParse({ ...base, role: 'PROFESIONAL' }).success).toBe(true)
    expect(crearUsuarioSchema.safeParse({ ...base, role: 'JEFE' }).success).toBe(false)
    expect(crearUsuarioSchema.safeParse({ ...base, role: 'ADMIN', password: 'corta1' }).success).toBe(false)
  })
})

describe('auditoría', () => {
  it('nunca copia secretos al rastro', () => {
    const limpio = limpiar({
      email: 'a@b.co',
      passwordHash: '$argon2id$secreto',
      password: 'en-claro',
      tokenHash: 'abc',
      role: 'ADMIN',
    })
    expect(limpio).toEqual({ email: 'a@b.co', role: 'ADMIN' })
  })

  it('serializa fechas para que el JSON sea estable', () => {
    const limpio = limpiar({ createdAt: new Date('2026-08-20T03:00:00.000Z') })
    expect(limpio.createdAt).toBe('2026-08-20T03:00:00.000Z')
  })
})
