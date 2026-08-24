import { prisma } from '../config/database.js'
import { VIVOS } from '../services/assignmentState.service.js'

const vivos = { deletedAt: null }
const esUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

/**
 * MODELO: CaseAssignment
 */
export const CaseAssignmentModel = {
  create(data) {
    return prisma.caseAssignment.create({ data })
  },

  findById(id) {
    if (!esUuid(id)) return null
    return prisma.caseAssignment.findFirst({
      where: { id, ...vivos },
      include: { professional: true, patient: true },
    })
  },

  /**
   * La asignación EN CURSO de un paciente: propuesta, aceptada o activa.
   *
   * Un índice único garantiza que solo haya una. Se llama "abierta" y no
   * "activa" a propósito: desde que asignar es una negociación, la mayor
   * parte del tiempo un caso está esperando respuesta, no acompañándose.
   */
  findAbiertaDePaciente(patientId) {
    if (!esUuid(patientId)) return null
    return prisma.caseAssignment.findFirst({
      where: { patientId, status: { in: VIVOS }, ...vivos },
      include: { professional: true },
    })
  },

  /** Solo la que ya tiene cita: acompañamiento en curso de verdad. */
  findActivaDePaciente(patientId) {
    if (!esUuid(patientId)) return null
    return prisma.caseAssignment.findFirst({
      where: { patientId, status: 'ACTIVA', ...vivos },
      include: { professional: true },
    })
  },

  findDeProfesional(professionalId, { status = 'ACTIVA' } = {}) {
    if (!esUuid(professionalId)) return []
    return prisma.caseAssignment.findMany({
      where: { professionalId, ...(status ? { status } : {}), ...vivos },
      include: { patient: true },
      orderBy: { startedAt: 'desc' },
    })
  },

  /**
   * Cuántos casos ocupan a este profesional.
   *
   * Cuenta las propuestas sin responder, no solo los acompañamientos en curso.
   * Si no, se le puede proponer el mismo profesional a diez personas a la vez
   * y todas "caben" en su cupo.
   */
  contarActivas(professionalId) {
    return prisma.caseAssignment.count({
      where: { professionalId, status: { in: VIVOS }, ...vivos },
    })
  },

  /** Marca la respuesta del profesional a una propuesta. */
  responder(id, { acepta, dias = [], franjas = [], nota = null, motivo = null }) {
    return prisma.caseAssignment.update({
      where: { id },
      data: {
        status: acepta ? 'ACEPTADA' : 'RECHAZADA',
        respondedAt: new Date(),
        acceptedDays: acepta ? dias : [],
        acceptedSlots: acepta ? franjas : [],
        availabilityNote: acepta ? nota : null,
        declineReason: acepta ? null : motivo,
        ...(acepta ? {} : { endedAt: new Date() }),
      },
    })
  },

  /** La persona acompañada eligió horario: el caso arranca de verdad. */
  activar(id) {
    return prisma.caseAssignment.update({
      where: { id },
      data: { status: 'ACTIVA', patientConfirmedAt: new Date(), startedAt: new Date() },
    })
  },

  /** Aceptó, pero no hubo forma de cuadrar. Vuelve a la cola. */
  cancelar(id, motivo) {
    return prisma.caseAssignment.update({
      where: { id },
      data: { status: 'CANCELADA', endedAt: new Date(), closeReason: motivo ?? null },
    })
  },

  cerrar(id, motivo) {
    return prisma.caseAssignment.update({
      where: { id },
      data: { status: 'CERRADA', endedAt: new Date(), closeReason: motivo ?? null },
    })
  },
}
