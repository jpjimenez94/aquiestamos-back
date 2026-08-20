import { prisma } from '../config/database.js'
import { ok } from '../views/response.view.js'
import { formatearLocal } from '../services/timezone.service.js'

/**
 * Indicadores de operacion. Lo que el equipo mira al empezar el dia.
 */
export const DashboardController = {
  /** GET /api/dashboard */
  async index(req, res, next) {
    try {
      const ahora = new Date()
      const finDeHoy = new Date(ahora.getTime() + 24 * 3600 * 1000)
      const enUnaSemana = new Date(ahora.getTime() + 7 * 24 * 3600 * 1000)

      const [
        solicitudesNuevas,
        sinAsignar,
        profesionalesActivos,
        conCupo,
        citasHoy,
        citasSemana,
        porEstado,
      ] = await Promise.all([
        prisma.supportRequest.count({ where: { status: 'NUEVO', deletedAt: null } }),
        prisma.patient.count({
          where: {
            deletedAt: null,
            status: { in: ['NUEVO', 'EN_ADMISION'] },
            assignments: { none: { status: 'ACTIVA', deletedAt: null } },
          },
        }),
        prisma.professional.count({ where: { status: 'ACTIVO', deletedAt: null } }),
        prisma.professional.findMany({
          where: { status: 'ACTIVO', deletedAt: null },
          select: { id: true, maxActiveCases: true, _count: { select: { assignments: true } } },
        }),
        prisma.appointment.count({
          where: { startsAt: { gte: ahora, lt: finDeHoy }, status: { in: ['PROGRAMADA', 'CONFIRMADA'] } },
        }),
        prisma.appointment.count({
          where: { startsAt: { gte: ahora, lt: enUnaSemana }, status: { in: ['PROGRAMADA', 'CONFIRMADA'] } },
        }),
        prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
      ])

      // Cuanto lleva esperando la persona que mas ha esperado sin asignar.
      const masAntigua = await prisma.patient.findFirst({
        where: {
          deletedAt: null,
          status: { in: ['NUEVO', 'EN_ADMISION'] },
          assignments: { none: { status: 'ACTIVA', deletedAt: null } },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, fullName: true },
      })

      return res.json(
        ok({
          bandeja: {
            solicitudesSinRevisar: solicitudesNuevas,
            personasSinAsignar: sinAsignar,
            esperaMasLarga: masAntigua
              ? {
                  dias: Math.floor((Date.now() - masAntigua.createdAt.getTime()) / 86400000),
                  desde: formatearLocal(masAntigua.createdAt),
                }
              : null,
          },
          red: {
            profesionalesActivos,
            conCupoLibre: conCupo.filter((p) => p._count.assignments < p.maxActiveCases).length,
          },
          agenda: {
            citasProximas24h: citasHoy,
            citasProximos7dias: citasSemana,
            porEstado: Object.fromEntries(porEstado.map((f) => [f.status, f._count._all])),
          },
        }),
      )
    } catch (error) {
      next(error)
    }
  },
}
