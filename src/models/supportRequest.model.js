import { prisma } from '../config/database.js'

/** Los registros con `deletedAt` no existen para el resto de la aplicación. */
const vivos = { deletedAt: null }
const esUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

/**
 * MODELO: SupportRequest
 * Solicitudes de acompañamiento enviadas desde "Atención Psicológica".
 */
export const SupportRequestModel = {
  create(data) {
    return prisma.supportRequest.create({ data })
  },

  findById(id) {
    if (!esUuid(id)) return null
    return prisma.supportRequest.findFirst({ where: { id, ...vivos } })
  },

  /**
   * La bandeja, con lo que falta por atender arriba.
   *
   * El orden es por estado y no por fecha porque esto es una cola de trabajo:
   * lo que llegó hace una semana y sigue en NUEVO importa más que lo que llegó
   * ayer y ya se admitió. `SubmissionStatus` está declarado en ese mismo orden
   * —NUEVO, EN_REVISION, CONTACTADO, ACTIVO, DESCARTADO—, así que `asc` sobre
   * el enum ya deja lo pendiente primero; dentro de cada estado, lo más
   * reciente arriba.
   */
  findAll({ skip, take, status } = {}) {
    return prisma.supportRequest.findMany({
      where: { ...vivos, ...(status ? { status } : {}) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    })
  },

  count({ status } = {}) {
    return prisma.supportRequest.count({ where: { ...vivos, ...(status ? { status } : {}) } })
  },

  updateStatus(id, status) {
    return prisma.supportRequest.update({ where: { id }, data: { status } })
  },

  /** Borrado lógico: el registro se conserva para la auditoría. */
  softDelete(id) {
    return prisma.supportRequest.update({ where: { id }, data: { deletedAt: new Date() } })
  },
}
