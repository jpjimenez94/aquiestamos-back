import { prisma } from '../config/database.js'
import { VIVOS } from '../services/assignmentState.service.js'
import { PROPUESTA_VENCE_DIAS, ACEPTADA_VENCE_DIAS } from '../asignacion/barrido.js'
import { SLA_ALTA_DIAS } from '../citas/barrido.js'
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
            assignments: { none: { status: { in: VIVOS }, deletedAt: null } },
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
          assignments: { none: { status: { in: VIVOS }, deletedAt: null } },
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

  /**
   * GET /api/dashboard/tablero
   *
   * Devuelve todos los casos activos agrupados en las 5 columnas del pipeline,
   * que siguen la máquina de estados de la asignación — no la verificación de
   * la tarjeta profesional, que es un trámite del profesional (vive en
   * postulaciones) y no una etapa del caso:
   *
   *   1. porAsignar          sin negociación abierta
   *   2. esperandoProfesional PROPUESTA: le llegó el enlace, no ha respondido
   *   3. porCuadrarHorario    ACEPTADA: dijo sí, falta que la persona confirme
   *   4. citasAbiertas        PROGRAMADA (horario propuesto) / CONFIRMADA
   *   5. enAcompanamiento     ACTIVA y sin cita abierta: la cita ya pasó,
   *                           toca seguimiento
   *   6. cerrados             los últimos 15, para que cerrar no sea desaparecer
   *
   * Las columnas 2 y 3 llevan cuántos días faltan para que el barrido libere
   * la asignación, con el mismo umbral que usa el barrido: dos sitios contando
   * días es un sitio mintiendo. La TP sin verificar va como aviso en la card.
   */
  async tablero(req, res, next) {
    try {
      const ahora = new Date()
      const hace24h = new Date(ahora.getTime() - 24 * 3600 * 1000)

      // 1. Pacientes activos con su asignación activa (incluye profesional y su TP)
      const pacientes = await prisma.patient.findMany({
        where: {
          deletedAt: null,
          status: { not: 'CERRADO' },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          assignments: {
            where: { status: { in: VIVOS }, deletedAt: null },
            take: 1,
            include: {
              professional: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  professionalCardVerified: true,
                  professionalCardNumber: true,
                  professionalCardDocumentUrl: true,
                },
              },
            },
          },
        },
      })

      // 2. Citas abiertas (desde 24h atrás para incluir citas en curso)
      const citasAbiertas = await prisma.appointment.findMany({
        where: {
          startsAt: { gte: hace24h },
          status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          modality: true,
          consentSigned: true,
          consentSignedDocumentUrl: true,
          patient: {
            select: { id: true, fullName: true, phone: true },
          },
          professional: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { startsAt: 'asc' },
      })

      // Aplanar estructura para el frontend
      const mapearPaciente = (p) => {
        const asignacion = p.assignments[0] ?? null
        return {
          id: p.id,
          fullName: p.fullName,
          city: p.city,
          status: p.status,
          priority: p.priority,
          isMinor: p.isMinor,
          createdAt: p.createdAt,
          diasEsperando: Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000),
          asignacion: asignacion
            ? {
                id: asignacion.id,
                desde: asignacion.startedAt,
                estado: asignacion.status,
                // Lo que el profesional ofreció al aceptar, para que quien
                // coordina lo vea sin abrir la ficha.
                diasOfrecidos: asignacion.acceptedDays ?? [],
                franjasOfrecidas: asignacion.acceptedSlots ?? [],
                notaDisponibilidad: asignacion.availabilityNote ?? null,
                // Cuántos días faltan para que el barrido libere el caso. El
                // reloj de la PROPUESTA corre desde que se propuso; el de la
                // ACEPTADA, desde que el profesional respondió.
                venceEnDias:
                  asignacion.status === 'PROPUESTA'
                    ? Math.max(
                        0,
                        Math.ceil(
                          PROPUESTA_VENCE_DIAS -
                            (Date.now() - new Date(asignacion.startedAt).getTime()) / 86400000,
                        ),
                      )
                    : asignacion.status === 'ACEPTADA' && asignacion.respondedAt
                      ? Math.max(
                          0,
                          Math.ceil(
                            ACEPTADA_VENCE_DIAS -
                              (Date.now() - new Date(asignacion.respondedAt).getTime()) / 86400000,
                          ),
                        )
                      : null,
                profesional: {
                  id: asignacion.professional.id,
                  nombre: asignacion.professional.fullName,
                  telefono: asignacion.professional.phone,
                  professionalCardVerified: asignacion.professional.professionalCardVerified ?? false,
                  professionalCardNumber: asignacion.professional.professionalCardNumber,
                  professionalCardDocumentUrl: asignacion.professional.professionalCardDocumentUrl,
                },
              }
            : null,
        }
      }

      // Columnas del pipeline: la 1 por ausencia de negociación, la 2 y la 3
      // por el estado de la asignación, la 4 por las citas y la 5 por el
      // estado del paciente.
      /**
       * Sin negociación viva = por asignar. A propósito no se mira el estado
       * del paciente: los casos de antes de que asignar fuera una negociación
       * quedaron con el estado viejo ASIGNADO, y filtrar por estado los hacía
       * invisibles en todas las columnas a la vez.
       */
      const porAsignar = pacientes
        .filter((p) => p.assignments.length === 0)
        .map((p) => {
          const base = mapearPaciente(p)
          return {
            ...base,
            // El mismo umbral que usa la alarma del barrido: la card grita
            // cuando una ALTA lleva demasiados días sin profesional.
            slaVencido: p.priority === 'ALTA' && base.diasEsperando >= SLA_ALTA_DIAS,
          }
        })

      const esperandoProfesional = pacientes
        .filter((p) => p.assignments[0]?.status === 'PROPUESTA')
        .map(mapearPaciente)

      const porCuadrarHorario = pacientes
        .filter((p) => p.assignments[0]?.status === 'ACEPTADA')
        .map(mapearPaciente)

      /**
       * ACTIVA en la asignación, no EN_ACOMPANAMIENTO en el paciente: la
       * máquina de estados es la fuente de verdad, y los casos legacy tienen
       * el paciente en ASIGNADO con la asignación perfectamente activa.
       *
       * Y sin cita abierta: mientras hay una cita sobre la mesa el caso vive
       * en la columna 4, no en las dos a la vez. A esta columna se llega
       * cuando la cita ya pasó o se marcó realizada — que es cuando de verdad
       * toca el seguimiento: leer el reporte, agendar la siguiente o cerrar.
       */
      const conCitaAbierta = new Set(citasAbiertas.map((c) => c.patient.id))
      const enAcompanamiento = pacientes
        .filter((p) => p.assignments[0]?.status === 'ACTIVA' && !conCitaAbierta.has(p.id))
        .map(mapearPaciente)

      // Los cerrados recientes, para que cerrar no sea desaparecer: quien
      // coordina puede ver qué se cerró, cuándo y por qué sin ir a auditoría.
      const cerradosCrudos = await prisma.patient.findMany({
        where: { deletedAt: null, status: 'CERRADO' },
        orderBy: { updatedAt: 'desc' },
        take: 15,
        include: {
          assignments: {
            where: { deletedAt: null },
            orderBy: { endedAt: 'desc' },
            take: 1,
            include: { professional: { select: { id: true, fullName: true } } },
          },
        },
      })

      const cerrados = cerradosCrudos.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        city: p.city,
        cerradoEl: p.assignments[0]?.endedAt ?? p.updatedAt,
        motivo: p.assignments[0]?.closeReason ?? null,
        profesional: p.assignments[0]?.professional?.fullName ?? null,
      }))

      const citasMapeadas = citasAbiertas.map((c) => ({
        id: c.id,
        inicio: c.startsAt,
        fin: c.endsAt,
        estado: c.status,
        modalidad: c.modality,
        consentSigned: c.consentSigned,
        consentSignedDocumentUrl: c.consentSignedDocumentUrl,
        paciente: { id: c.patient.id, nombre: c.patient.fullName, telefono: c.patient.phone },
        profesional: { id: c.professional.id, nombre: c.professional.fullName },
      }))

      const citasPropuestas = citasMapeadas.filter((c) => c.estado === 'PROGRAMADA')
      const citasConfirmadas = citasMapeadas.filter((c) => c.estado === 'CONFIRMADA')

      return res.json(
        ok({
          porAsignar,
          esperandoProfesional,
          porCuadrarHorario,
          citasAbiertas: citasMapeadas,
          citasPropuestas,
          citasConfirmadas,
          enAcompanamiento,
          cerrados,
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /**
   * GET /api/dashboard/metricas — las métricas de impacto de la red.
   *
   * Para el informe mensual y para pedir recursos: el embudo con sus tiempos,
   * qué tan seguido aceptan los profesionales, en qué terminan los casos y
   * qué dice la gente en la encuesta del cierre. Solo lectura: nada de aquí
   * se edita, y por eso el permiso es `metricas:leer` (ADMIN y LECTURA).
   */
  async metricas(req, res, next) {
    try {
      const DIA = 24 * 3600 * 1000
      const prom = (valores) =>
        valores.length ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10 : null

      // ---------- personas ----------
      const personas = await prisma.patient.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          priority: true,
          createdAt: true,
        },
      })

      const porEstado = {}
      const porPrioridad = {}
      for (const p of personas) {
        porEstado[p.status] = (porEstado[p.status] ?? 0) + 1
        porPrioridad[p.priority] = (porPrioridad[p.priority] ?? 0) + 1
      }

      // ---------- asignaciones: el embudo y la tasa de respuesta ----------
      const asignaciones = await prisma.caseAssignment.findMany({
        where: { deletedAt: null },
        select: {
          patientId: true,
          professionalId: true,
          status: true,
          startedAt: true,
          respondedAt: true,
          patientConfirmedAt: true,
          closeReason: true,
          professional: { select: { fullName: true } },
          patient: { select: { createdAt: true } },
        },
      })

      let aceptadas = 0
      let rechazadas = 0
      let vencidasSinRespuesta = 0
      let canceladasOtras = 0
      const motivosDeCierre = {}
      const porProfesional = {}
      const diasHastaPrimeraPropuesta = []
      const diasPropuestaARespuesta = []

      const primeraPropuestaDe = {}
      for (const a of asignaciones) {
        const antes = primeraPropuestaDe[a.patientId]
        if (!antes || a.startedAt < antes) primeraPropuestaDe[a.patientId] = a.startedAt

        if (['ACEPTADA', 'ACTIVA', 'CERRADA'].includes(a.status)) aceptadas += 1
        else if (a.status === 'RECHAZADA') rechazadas += 1
        else if (a.status === 'CANCELADA') {
          if (String(a.closeReason ?? '').startsWith('Liberada: el profesional no respondió')) {
            vencidasSinRespuesta += 1
          } else {
            canceladasOtras += 1
          }
        }

        if (a.status === 'CERRADA' && a.closeReason) {
          // El motivo sin el matiz después de los dos puntos, para agrupar.
          const motivo = a.closeReason.split(':')[0].trim()
          motivosDeCierre[motivo] = (motivosDeCierre[motivo] ?? 0) + 1
        }

        if (['ACTIVA', 'CERRADA'].includes(a.status)) {
          const nombre = a.professional?.fullName ?? 'Sin nombre'
          porProfesional[nombre] = (porProfesional[nombre] ?? 0) + 1
        }

        if (a.respondedAt) {
          diasPropuestaARespuesta.push((a.respondedAt - a.startedAt) / DIA)
        }
      }

      const personaPorId = new Map(personas.map((p) => [p.id, p]))
      for (const [patientId, primera] of Object.entries(primeraPropuestaDe)) {
        const persona = personaPorId.get(patientId)
        if (persona) diasHastaPrimeraPropuesta.push((primera - persona.createdAt) / DIA)
      }

      // ---------- citas ----------
      const citasPorEstado = await prisma.appointment.groupBy({
        by: ['status'],
        _count: { _all: true },
      })
      const citas = {}
      for (const c of citasPorEstado) citas[c.status] = c._count._all
      const realizadas = citas.REALIZADA ?? 0
      const noAsistio = citas.NO_ASISTIO ?? 0
      const tasaAsistencia =
        realizadas + noAsistio > 0 ? Math.round((realizadas / (realizadas + noAsistio)) * 100) : null

      // ---------- encuesta del cierre ----------
      const encuestas = await prisma.closureSurvey.findMany({
        select: { helped: true, wouldRecommend: true },
      })
      const encuesta = {
        respondidas: encuestas.length,
        leSirvio: encuestas.filter((e) => e.helped === 'SI').length,
        algoLeSirvio: encuestas.filter((e) => e.helped === 'ALGO').length,
        noLeSirvio: encuestas.filter((e) => e.helped === 'NO').length,
        recomendaria: encuestas.filter((e) => e.wouldRecommend).length,
      }

      return res.json(
        ok({
          personas: { total: personas.length, porEstado, porPrioridad },
          embudo: {
            diasPromedioHastaPrimeraPropuesta: prom(diasHastaPrimeraPropuesta),
            diasPromedioRespuestaDelProfesional: prom(diasPropuestaARespuesta),
          },
          asignaciones: {
            total: asignaciones.length,
            aceptadas,
            rechazadas,
            vencidasSinRespuesta,
            canceladasOtras,
            tasaAceptacion:
              asignaciones.length > 0 ? Math.round((aceptadas / asignaciones.length) * 100) : null,
          },
          motivosDeCierre,
          casosPorProfesional: Object.entries(porProfesional)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([nombre, casos]) => ({ nombre, casos })),
          citas: { porEstado: citas, tasaAsistencia },
          encuesta,
        }),
      )
    } catch (error) {
      next(error)
    }
  },
}