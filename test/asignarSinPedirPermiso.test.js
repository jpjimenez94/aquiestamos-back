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

  /**
   * Con agenda, porque sin ella ya no se le puede asignar nada.
   *
   * Asignar sin preguntar solo es justo si a quien recibe el caso se le puede
   * elegir una hora: el paso siguiente manda a la persona a escoger «entre los
   * espacios que él ya tiene marcados como libres». Un profesional sin franjas
   * es una pantalla vacía y un caso parado, así que `proponerCaso` lo rechaza.
   *
   * Quien sale de aprobar una postulación llega igual: sus días y franjas del
   * formulario se convierten en reglas de disponibilidad.
   */
  await prisma.availabilityRule.create({
    data: {
      professionalId: profesional.id,
      weekday: 'MARTES',
      startMinute: 8 * 60,
      endMinute: 12 * 60,
      modality: 'VIRTUAL',
    },
  })

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
  await prisma.availabilityRule.deleteMany({ where: { professionalId: profesionalId } })
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

  it('el profesional puede declinar DESDE DONDE nace la asignación', async () => {
    /**
     * Esta línea decía PROPUESTA y por eso no sirvió de nada.
     *
     * Comprobaba que se pudiera declinar desde un estado por el que, tras este
     * mismo cambio, ya no pasa ninguna asignación nueva. Estuvo en verde
     * mientras el profesional no tenía forma de negarse: el mensaje le decía
     * «si no puedes, dilo ahí mismo» y desde ACEPTADA —donde nace ahora— la
     * única salida era CANCELADA, que ni es suya ni dice lo mismo.
     *
     * Una prueba que mira el camino que ya nadie recorre da la peor de las
     * señales: la de que algo está cubierto.
     */
    expect(transicionesDesde(ESTADOS.ACEPTADA)).toContain(ESTADOS.RECHAZADA)

    // Y se conserva para las de antes del cambio.
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
