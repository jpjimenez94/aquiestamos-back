import { prisma } from '../config/database.js'

export const TaskAssignmentModel = {
  create(data) {
    return prisma.taskAssignment.create({
      data,
      include: {
        collaborator: { select: { id: true, fullName: true, email: true, phone: true, area: true, discipline: true } },
        task: { select: { id: true, title: true, area: true, dueDate: true, startTime: true, endTime: true, materialsUrl: true, notes: true } },
      },
    })
  },

  findById(id) {
    return prisma.taskAssignment.findUnique({
      where: { id },
      include: {
        collaborator: { select: { id: true, fullName: true, email: true, phone: true, area: true, discipline: true } },
        task: { select: { id: true, title: true, description: true, area: true, dueDate: true, startTime: true, endTime: true, materialsUrl: true, notes: true, status: true, priority: true } },
      },
    })
  },

  findByToken(confirmToken) {
    return prisma.taskAssignment.findUnique({
      where: { confirmToken },
      include: {
        collaborator: { select: { id: true, fullName: true, email: true } },
        task: { select: { id: true, title: true, description: true, area: true, dueDate: true, startTime: true, endTime: true, materialsUrl: true, notes: true, priority: true } },
      },
    })
  },

  findByTaskAndCollaborator(taskId, collaboratorId) {
    return prisma.taskAssignment.findUnique({
      where: { taskId_collaboratorId: { taskId, collaboratorId } },
    })
  },

  findByCollaborator(collaboratorId) {
    return prisma.taskAssignment.findMany({
      where: { collaboratorId },
      include: {
        task: { select: { id: true, title: true, area: true, dueDate: true, priority: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  update(id, data) {
    return prisma.taskAssignment.update({ where: { id }, data })
  },

  delete(id) {
    return prisma.taskAssignment.delete({ where: { id } })
  },
}
