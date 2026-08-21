import { prisma } from '../config/database.js'

/**
 * MODELO: CaseReport
 *
 * La bitácora de lo que el profesional cuenta sobre su asignación. Se añade,
 * no se corrige: cada reporte es un hecho con su fecha.
 */
export const CaseReportModel = {
  create(data) {
    return prisma.caseReport.create({ data })
  },

  /** Lo reportado en una asignación, de lo más reciente a lo más antiguo. */
  findDeAsignacion(assignmentId) {
    return prisma.caseReport.findMany({
      where: { assignmentId },
      orderBy: { createdAt: 'desc' },
    })
  },

  /** Lo reportado sobre una persona, aunque haya cambiado de profesional. */
  findDePaciente(patientId) {
    return prisma.caseReport.findMany({
      where: { assignment: { patientId } },
      orderBy: { createdAt: 'desc' },
      include: {
        assignment: {
          select: { professional: { select: { fullName: true } } },
        },
      },
    })
  },

  /** El último reporte de cada asignación abierta. Alimenta el tablero. */
  ultimoDeCadaAsignacion(assignmentIds) {
    return prisma.caseReport.findMany({
      where: { assignmentId: { in: assignmentIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['assignmentId'],
    })
  },
}
