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

  /**
   * Corrige el texto y deja la firma de quien lo corrigió.
   *
   * No toca al autor ni la fecha original: la nota sigue siendo de quien la
   * escribió, y el historial no se reordena por haberla arreglado.
   */
  actualizar({ id, note, editorName, editorEmail }) {
    return prisma.patientNote.update({
      where: { id },
      data: {
        note,
        editedAt: new Date(),
        editedByName: editorName,
        editedByEmail: editorEmail,
      },
    })
  },

  delete(id) {
    return prisma.patientNote.delete({
      where: { id },
    })
  },
}
