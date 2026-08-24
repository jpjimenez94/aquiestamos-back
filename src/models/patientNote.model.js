import { prisma } from '../config/database.js'

/**
 * MODELO: PatientNote
 *
 * Bitácora de notas de seguimiento del equipo de coordinación y agendamiento
 * sobre una persona acompañada.
 */
export const PatientNoteModel = {
  create({ patientId, note, authorName, authorEmail }) {
    return prisma.patientNote.create({
      data: {
        patientId,
        note,
        authorName,
        authorEmail,
      },
    })
  },

  findDePaciente(patientId) {
    return prisma.patientNote.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    })
  },

  findById(id) {
    return prisma.patientNote.findUnique({
      where: { id },
    })
  },

  delete(id) {
    return prisma.patientNote.delete({
      where: { id },
    })
  },
}
