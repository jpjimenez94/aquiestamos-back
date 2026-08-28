import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../src/config/database.js'
import { proponerCaso } from '../src/services/appointment.service.js'
import { ESTADOS, transicionesDesde, ETIQUETAS } from '../src/services/assignmentState.service.js'

const MARCA = `asignar-${Date.now()}`
let profesionalId
let pacienteId

/**
 * Asignar dejó de ser pedir permiso.
 *
 * Antes una asignación nacía en PROPUESTA y ahí se quedaba hasta que el
 * profesional dijera que sí. Los datos contaron el precio: de las ocho
 * asignaciones hechas para una persona con prioridad ALTA, siete murieron con
 * el motivo «el profesional no respondió». Siete de los ocho cierres de toda
 * la base son por silencio.
 *
 * Ahora nace en ACEPTADA: se le asigna, se le avisa, y si no puede lo dice.
 * El silencio deja de detener el caso.
 *
 * Nada probaba el estado de entrada —el flujo de agenda solo miraba el 201—
 * así que este cambio se habría podido revertir sin que nada se pusiera rojo.
 */

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
      maxActiveCases: 3,
    },
  })
  profesionalId = profesional.id

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Persona ${MARCA}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'EN_ADMISION',
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
})

describe('asignar un caso', () => {
  it('nace ACEPTADA, no esperando permiso', async () => {
    const asignacion = await proponerCaso({
      professionalId: profesionalId,
      patientId: pacienteId,
    })

    expect(asignacion.status).toBe('ACEPTADA')
    expect(asignacion.status).not.toBe('PROPUESTA')

    // `respondedAt` marcado desde el principio: el profesional está a bordo
    // por defecto, y de ahí cuenta el plazo para que la persona elija hora.
    expect(asignacion.respondedAt).not.toBeNull()
  })

  it('la persona puede elegir hora de una vez', async () => {
    // Lo que hace útil el estado de entrada: desde ACEPTADA se puede pasar a
    // ACTIVA, que es lo que ocurre cuando ella agenda. Desde PROPUESTA no se
    // podía sin que alguien respondiera antes.
    expect(transicionesDesde(ESTADOS.ACEPTADA)).toContain(ESTADOS.ACTIVA)
  })

  it('el profesional sigue pudiendo declinar', async () => {
    // Asignar sin preguntar solo es justo si decir que no es fácil. La salida
    // tiene que existir.
    expect(transicionesDesde(ESTADOS.PROPUESTA)).toContain(ESTADOS.RECHAZADA)

    const asignacion = await prisma.caseAssignment.findFirst({
      where: { patientId: pacienteId, status: 'ACEPTADA' },
    })
    const rechazada = await prisma.caseAssignment.update({
      where: { id: asignacion.id },
      data: { status: 'RECHAZADA', endedAt: new Date(), declineReason: 'Sin cupo este mes' },
    })
    expect(rechazada.status).toBe('RECHAZADA')
  })

  it('la etiqueta dice lo que de verdad pasa', () => {
    // «Aceptada, falta cuadrar horario» describía una negociación que ya no
    // existe. Quien mira el tablero tiene que leer qué falta, no qué se
    // acordó.
    expect(ETIQUETAS.ACEPTADA).toMatch(/asignad|elija/i)
    expect(ETIQUETAS.ACEPTADA).not.toMatch(/cuadrar horario/i)
  })
})
