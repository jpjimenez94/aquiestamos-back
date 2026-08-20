import { prisma } from '../config/database.js'

const vivos = { deletedAt: null }

/**
 * MODELO: CaseAssignment
 */
export const CaseAssignmentModel = {
  create(data) {
    return prisma.caseAssignment.create({ data })
  },

  findById(id) {
    return prisma.caseAssignment.findFirst({
      where: { id, ...vivos },
      include: { professional: true, patient: true },
    })
  },

  /** La asignación activa de un paciente, si tiene. Solo puede haber una. */
  findActivaDePaciente(patientId) {
    return prisma.caseAssignment.findFirst({
      where: { patientId, status: 'ACTIVA', ...vivos },
      include: { professional: true },
    })
  },

  findDeProfesional(professionalId, { status = 'ACTIVA' } = {}) {
    return prisma.caseAssignment.findMany({
      where: { professionalId, ...(status ? { status } : {}), ...vivos },
      include: { patient: true },
      orderBy: { startedAt: 'desc' },
    })
  },

  contarActivas(professionalId) {
    return prisma.caseAssignment.count({
      where: { professionalId, status: 'ACTIVA', ...vivos },
    })
  },

  cerrar(id, motivo) {
    return prisma.caseAssignment.update({
      where: { id },
      data: { status: 'CERRADA', endedAt: new Date(), closeReason: motivo ?? null },
    })
  },
}
