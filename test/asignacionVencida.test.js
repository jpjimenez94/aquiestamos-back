import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../src/config/database.js'
import { barrerAsignaciones, PROPUESTA_VENCE_HORAS } from '../src/asignacion/barrido.js'

/**
 * El barrido que libera lo que se quedó esperando.
 *
 * No tenía ninguna prueba, y es de las piezas que más consecuencias tienen:
 * cancela asignaciones sin que nadie lo pida, libera el cupo del profesional y
 * devuelve a la persona a la cola. Si se rompe, no falla nada visible — los
 * casos simplemente se quedan quietos, que es exactamente el problema que este
 * barrido vino a resolver.
 *
 * El plazo del profesional pasó de dos DÍAS a dos HORAS. Los datos lo pedían:
 * de ocho propuestas hechas para una persona con prioridad ALTA, siete
 * murieron por silencio, y a dos días cada una eso son semanas de espera.
 */

const MARCA = `barrido-${Date.now()}`
let profesionalId
let pacienteId

beforeAll(async () => {
  const profesional = await prisma.professional.create({
    data: {
      fullName: `Profesional ${MARCA}`,
      email: `prof.${MARCA}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
      maxActiveCases: 5,
    },
  })
  profesionalId = profesional.id

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Persona ${MARCA}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'ASIGNADO',
      priority: 'ALTA',
      preferredModality: 'VIRTUAL',
    },
  })
  pacienteId = paciente.id
})

afterAll(async () => {
  await prisma.caseAssignment.deleteMany({ where: { patientId: pacienteId } })
  await prisma.patient.deleteMany({ where: { id: pacienteId } })
  await prisma.professional.deleteMany({ where: { id: profesionalId } })
  await prisma.notification.deleteMany({ where: { toEmail: { contains: MARCA } } })
})

async function crearPropuesta(hace) {
  return prisma.caseAssignment.create({
    data: {
      patientId: pacienteId,
      professionalId: profesionalId,
      status: 'PROPUESTA',
      startedAt: new Date(Date.now() - hace),
    },
  })
}

const HORA = 3600 * 1000

describe('el plazo del profesional se mide en horas', () => {
  it('el valor por defecto son 2 horas, no 2 días', () => {
    expect(PROPUESTA_VENCE_HORAS).toBe(2)
  })

  it('una propuesta de hace 3 horas se libera', async () => {
    const a = await crearPropuesta(3 * HORA)
    await barrerAsignaciones()

    const despues = await prisma.caseAssignment.findUnique({ where: { id: a.id } })
    expect(despues.status).toBe('CANCELADA')
    // El motivo tiene que decir horas: es lo que lee quien revisa por qué se
    // le quitó un caso a alguien sin que nadie lo pidiera.
    expect(despues.closeReason).toMatch(/hora/i)
  })

  it('una propuesta de hace 1 hora NO se toca', async () => {
    const a = await crearPropuesta(1 * HORA)
    await barrerAsignaciones()

    const despues = await prisma.caseAssignment.findUnique({ where: { id: a.id } })
    expect(despues.status).toBe('PROPUESTA')

    await prisma.caseAssignment.delete({ where: { id: a.id } })
  })

  it('el plazo se puede forzar, para no atar la prueba al valor por defecto', async () => {
    const a = await crearPropuesta(30 * 60 * 1000) // media hora

    await barrerAsignaciones({ horasPropuesta: 10 })
    expect((await prisma.caseAssignment.findUnique({ where: { id: a.id } })).status).toBe('PROPUESTA')

    await barrerAsignaciones({ horasPropuesta: 0.25 }) // 15 minutos
    expect((await prisma.caseAssignment.findUnique({ where: { id: a.id } })).status).toBe('CANCELADA')
  })

  it('liberar devuelve el cupo del profesional', async () => {
    const a = await crearPropuesta(3 * HORA)

    const ocupadoAntes = await prisma.caseAssignment.count({
      where: { professionalId: profesionalId, status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA'] } },
    })
    expect(ocupadoAntes).toBeGreaterThan(0)

    await barrerAsignaciones()

    const ocupadoDespues = await prisma.caseAssignment.count({
      where: { professionalId: profesionalId, status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA'] } },
    })
    expect(ocupadoDespues).toBe(ocupadoAntes - 1)
  })
})
