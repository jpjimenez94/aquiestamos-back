import { prisma } from '../config/database.js'

const vivos = { deletedAt: null }

export const TaskModel = {
  create(data) {
    return prisma.task.create({ data })
  },

  findById(id) {
    return prisma.task.findFirst({
      where: { id, ...vivos },
      include: {
        assignments: {
          include: {
            collaborator: {
              select: { id: true, fullName: true, phone: true, email: true, area: true, discipline: true, availableDays: true, availableSlots: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  },

  findAll({ skip, take, area, status, priority } = {}) {
    return prisma.task.findMany({
      where: {
        ...vivos,
        ...(area ? { area } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
      },
      include: {
        _count: { select: { assignments: true } },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    })
  },

  count({ area, status, priority } = {}) {
    return prisma.task.count({
      where: {
        ...vivos,
        ...(area ? { area } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
      },
    })
  },

  update(id, data) {
    return prisma.task.update({ where: { id }, data })
  },

  softDelete(id) {
    return prisma.task.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELADA' } })
  },
}
