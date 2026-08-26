import { prisma } from '../config/database.js'

export const MeetingAccessLogModel = {
  create(data) {
    return prisma.meetingAccessLog.create({ data })
  },

  findById(id) {
    return prisma.meetingAccessLog.findUnique({
      where: { id },
      include: { appointment: true },
    })
  },

  findByAppointment(appointmentId) {
    return prisma.meetingAccessLog.findMany({
      where: { appointmentId },
      orderBy: { joinedAt: 'asc' },
    })
  },

  updatePing(id, durationSeconds) {
    return prisma.meetingAccessLog.update({
      where: { id },
      data: {
        lastPingAt: new Date(),
        durationSeconds,
      },
    })
  },
}
