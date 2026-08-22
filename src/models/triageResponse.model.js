import { prisma } from '../config/database.js'

/**
 * MODELO: TriageResponse
 *
 * Bitácora, igual que `CaseReport`: se añade, no se corrige. La que vale para
 * decidir es siempre la más reciente.
 */
export const TriageResponseModel = {
  create(data) {
    return prisma.triageResponse.create({ data })
  },

  /** La última respuesta de una solicitud. */
  ultimaDe(supportRequestId) {
    return prisma.triageResponse.findFirst({
      where: { supportRequestId },
      orderBy: { createdAt: 'desc' },
    })
  },

  /**
   * La última de cada solicitud, en una sola consulta.
   * Alimenta la bandeja: sin esto sería una consulta por fila.
   */
  ultimaDeCada(supportRequestIds) {
    if (supportRequestIds.length === 0) return Promise.resolve([])
    return prisma.triageResponse.findMany({
      where: { supportRequestId: { in: supportRequestIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['supportRequestId'],
    })
  },
}
