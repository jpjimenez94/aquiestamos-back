import { prisma } from '../config/database.js'

/**
 * MODELO: Notification — la bandeja de salida de avisos.
 */
export const NotificationModel = {
  /**
   * Encola un aviso. Si ya existe uno con la misma `dedupeKey`, no hace nada:
   * es lo que evita que un reintento de la petición mande el correo dos veces.
   */
  async encolar(datos) {
    const [creado] = await prisma.notification
      .createManyAndReturn({ data: [datos], skipDuplicates: true })
      .catch(() => [null])

    return creado ?? null
  },

  /** Lo que toca enviar ahora: pendiente y con la espera cumplida. */
  pendientes(limite = 20) {
    return prisma.notification.findMany({
      where: { status: 'PENDIENTE', sendAfter: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limite,
    })
  },

  marcarEnviado(id) {
    return prisma.notification.update({
      where: { id },
      data: { status: 'ENVIADA', sentAt: new Date(), lastError: null },
    })
  },

  /** Anota el fallo y decide si se reintenta o se da por perdido. */
  marcarFallo(id, intentos, error, siguienteIntento) {
    return prisma.notification.update({
      where: { id },
      data: {
        attempts: intentos,
        lastError: String(error).slice(0, 500),
        ...(siguienteIntento
          ? { sendAfter: siguienteIntento }
          : { status: 'FALLIDA' }),
      },
    })
  },

  contar({ status } = {}) {
    return prisma.notification.count({ where: status ? { status } : {} })
  },

  ultimos(limite = 50) {
    return prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limite,
    })
  },
}
