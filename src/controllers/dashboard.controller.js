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
  /** GET /api/dashboard/badges — contadores para el menú lateral */
  async badges(req, res, next) {
    try {
      const ahora = new Date()
      const finDeHoy = new Date(ahora.getTime() + 24 * 3600 * 1000)

      const [
        solicitudesNuevas,
        postulacionesNuevas,
        colaboradoresNuevos,
        verificacionesPendientes,
        citasPendientesAgenda,
        tareasAbiertas,
      ] = await Promise.all([
        prisma.supportRequest.count({ where: { status: 'NUEVO', deletedAt: null } }),
        prisma.volunteer.count({ where: { status: 'NUEVO', deletedAt: null } }),
        prisma.collaborator.count({ where: { status: 'NUEVO', deletedAt: null } }),
        prisma.professional.count({
          where: {
            status: 'ACTIVO',
            deletedAt: null,
            professionalCardVerified: false,
            documentsSubmittedAt: { not: null },
          },
        }),
        prisma.appointment.count({
          where: {
            status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
            startsAt: { lte: finDeHoy },
          },
        }),
        prisma.task.count({
          where: {
            status: { in: ['ABIERTA', 'EN_PROGRESO'] },
            deletedAt: null,
          },
        }),
      ])

      let miAgendaCount = 0
      if (req.usuario?.professionalId) {
        miAgendaCount = await prisma.appointment.count({
          where: {
            professionalId: req.usuario.professionalId,
            status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
            startsAt: { lte: finDeHoy },
          },
        })
      }

      return res.json(
        ok({
          solicitudes: solicitudesNuevas,
          postulaciones: postulacionesNuevas,
          colaboradores: colaboradoresNuevos,
          verificaciones: verificacionesPendientes,
          agenda: citasPendientesAgenda,
          miAgenda: miAgendaCount,
          tareas: tareasAbiertas,
        }),
      )
    } catch (error) {
      next(error)
    }
  },

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

      // 1. Pacientes activos con su asignación activa (incluye profesional, última cita y último reporte)
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
              reports: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  outcome: true,
                  createdAt: true,
                  notes: true,
                },
              },
            },
          },
          appointments: {
            orderBy: { startsAt: 'desc' },
            take: 1,
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              modality: true,
              consentSigned: true,
            },
          },
        },
      })

      // 2. Citas abiertas (desde 24h atrás para incluir citas recientes)
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
        const ultimaCita = p.appointments?.[0] ?? null
        const ultimoReporte = asignacion?.reports?.[0] ?? null

        return {
          id: p.id,
          fullName: p.fullName,
          city: p.city,
          status: p.status,
          priority: p.priority,
          isMinor: p.isMinor,
          createdAt: p.createdAt,
          diasEsperando: Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000),
          ultimaCita: ultimaCita
            ? {
                id: ultimaCita.id,
                inicio: ultimaCita.startsAt,
                fin: ultimaCita.endsAt,
                estado: ultimaCita.status,
                modalidad: ultimaCita.modality,
              }
            : null,
          ultimoReporte: ultimoReporte
            ? {
                id: ultimoReporte.id,
                outcome: ultimoReporte.outcome,
                fecha: ultimoReporte.createdAt,
                notas: ultimoReporte.notes,
              }
            : null,
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
      // por el estado de la asignación, la 4 y 5 por las citas futuras o en curso, y la 6
      // por los casos en acompañamiento o cuya cita ya pasó (+45 min).
      const porAsignar = pacientes
        .filter((p) => p.assignments.length === 0)
        .map((p) => {
          const base = mapearPaciente(p)
          return {
            ...base,
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
       * Mapeo de citas evaluando si la sesión aún está vigente o si ya concluyó.
       * Una sesión dura 45 minutos (termina a las `startsAt + 45min` o `endsAt`).
       * Si ya pasaron los 45 minutos de la cita, ya no se muestra como pendiente en
       * Paso 4/5, sino que el caso pasa a Paso 6 (Acompañamiento / seguimiento).
       */
      const citasMapeadas = citasAbiertas.map((c) => {
        const finSesion = c.endsAt
          ? new Date(c.endsAt)
          : new Date(new Date(c.startsAt).getTime() + 45 * 60000)
        const yaPasoSesion = finSesion.getTime() <= ahora.getTime()

        return {
          id: c.id,
          inicio: c.startsAt,
          fin: c.endsAt,
          finSesion,
          yaPasoSesion,
          estado: c.status,
          modalidad: c.modality,
          consentSigned: c.consentSigned,
          consentSignedDocumentUrl: c.consentSignedDocumentUrl,
          paciente: { id: c.patient.id, nombre: c.patient.fullName, telefono: c.patient.phone },
          profesional: { id: c.professional.id, nombre: c.professional.fullName },
        }
      })

      // Columnas 4 y 5: Citas propuestas o confirmadas que todavía no han terminado
      const citasPropuestas = citasMapeadas.filter((c) => c.estado === 'PROGRAMADA' && !c.yaPasoSesion)
      const citasConfirmadas = citasMapeadas.filter((c) => c.estado === 'CONFIRMADA' && !c.yaPasoSesion)

      // Pacientes con alguna cita futura o en curso (que no haya terminado)
      const conCitaFutura = new Set(
        citasMapeadas.filter((c) => !c.yaPasoSesion).map((c) => c.paciente.id),
      )

      /**
       * Columna 6 (En acompañamiento / seguimiento):
       * Asignación ACTIVA y sin cita futura pendiente. Es decir:
       * - La cita acordada ya pasó (+45 min) y toca seguimiento / reporte.
       * - O el caso está en acompañamiento continuo.
       */
      const enAcompanamiento = pacientes
        .filter((p) => p.assignments[0]?.status === 'ACTIVA' && !conCitaFutura.has(p.id))
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

      // ---------- el camino completo, desde que alguien pide ayuda ----------
      //
      // Lo de arriba mide tramos sueltos. Esto mide el camino entero y, sobre
      // todo, DÓNDE se cae la gente: entre pedir ayuda y sentarse con un
      // profesional hay seis puertas, y hasta ahora nadie sabía cuál era la
      // que se traga a más personas.
      //
      // El tamizaje no aparecía en ninguna métrica y es la primera puerta: se
      // manda por WhatsApp y hay que abrir un enlace. Si mucha gente no lo
      // responde, el problema no está en la agenda ni en los profesionales,
      // está en el primer mensaje.
      // `Patient.supportRequestId` es una columna suelta, sin relación de
      // Prisma, así que las dos consultas se cruzan aquí. Con 34 solicitudes y
      // 28 personas eso no es un problema; si algún día lo fuera, la respuesta
      // es declarar la relación en el esquema, no complicar esto.
      const solicitudes = await prisma.supportRequest.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          createdAt: true,
          triageResponses: { select: { id: true }, take: 1 },
        },
      })

      const admitidos = await prisma.patient.findMany({
        where: { deletedAt: null, supportRequestId: { not: null } },
        select: {
          supportRequestId: true,
          assignments: {
            where: { deletedAt: null },
            select: { status: true, respondedAt: true },
          },
          appointments: { select: { status: true, startsAt: true } },
        },
      })
      const personaDeLaSolicitud = new Map(admitidos.map((p) => [p.supportRequestId, p]))

      const conTamizaje = solicitudes.filter((s) => s.triageResponses.length > 0)
      const admitidas = solicitudes.filter((s) => personaDeLaSolicitud.has(s.id))
      const personaDe = (s) => personaDeLaSolicitud.get(s.id)

      const conPropuesta = admitidas.filter((s) => personaDe(s).assignments.length > 0)
      const conAceptacion = admitidas.filter((s) =>
        personaDe(s).assignments.some(
          (a) => a.respondedAt || ['ACEPTADA', 'ACTIVA', 'CERRADA'].includes(a.status),
        ),
      )
      const conCita = admitidas.filter((s) => personaDe(s).appointments.length > 0)
      const conSesion = admitidas.filter((s) =>
        personaDe(s).appointments.some((c) => c.status === 'REALIZADA'),
      )

      /** Días entre pedir ayuda y sentarse por primera vez con alguien. */
      const diasHastaLaPrimeraSesion = conSesion
        .map((s) => {
          const realizadas = personaDe(s)
            .appointments.filter((c) => c.status === 'REALIZADA')
            .map((c) => new Date(c.startsAt).getTime())
          if (realizadas.length === 0) return null
          return (Math.min(...realizadas) - new Date(s.createdAt).getTime()) / DIA
        })
        .filter((d) => d !== null && d >= 0)

      /**
       * Mediana además del promedio: con pocos casos, uno que tardó dos meses
       * mueve el promedio y hace parecer lento un servicio que atiende a casi
       * todo el mundo en una semana.
       */
      const mediana = (valores) => {
        if (valores.length === 0) return null
        const orden = [...valores].sort((a, b) => a - b)
        const medio = Math.floor(orden.length / 2)
        const v = orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2
        return Math.round(v * 10) / 10
      }

      /**
       * Los pasos tienen que estar encajados de verdad: cada uno es un
       * subconjunto del anterior. Si no, la resta entre dos pasos no significa
       * nada.
       *
       * «Respondieron el tamizaje» NO va aquí, aunque ocurra antes en el
       * tiempo: se puede admitir a alguien que nunca lo respondió —el barrido
       * de admisión lo hace a propósito— así que había más admitidas que
       * respuestas y la caída salía en negativo. El tamizaje se mide aparte,
       * que es donde su número quiere decir algo.
       */
      const pasos = [
        ['Pidieron ayuda', solicitudes.length],
        ['Fueron admitidas', admitidas.length],
        ['Recibieron una propuesta', conPropuesta.length],
        ['Un profesional aceptó', conAceptacion.length],
        ['Quedó cita agendada', conCita.length],
        ['Tuvieron su sesión', conSesion.length],
      ]

      const camino = pasos.map(([etapa, cuantas], i) => ({
        etapa,
        cuantas,
        // Respecto al total: la caída acumulada de un vistazo.
        porcentaje: solicitudes.length > 0 ? Math.round((cuantas / solicitudes.length) * 100) : null,
        // Respecto al paso anterior: dónde está la puerta que atasca.
        seQuedaronAqui: i === 0 ? null : pasos[i - 1][1] - cuantas,
      }))

      return res.json(
        ok({
          personas: { total: personas.length, porEstado, porPrioridad },
          camino,
          // Cuántas solicitudes sostienen todo lo de arriba. Va explícito
          // porque con pocos casos un porcentaje engaña: «83 %» sobre seis
          // solicitudes es una persona, no una tendencia, y la pantalla tiene
          // que poder decirlo.
          caminoSobreCuantas: solicitudes.length,
          tamizaje: {
            enviados: solicitudes.length,
            respondidos: conTamizaje.length,
            tasaRespuesta:
              solicitudes.length > 0
                ? Math.round((conTamizaje.length / solicitudes.length) * 100)
                : null,
            // Las que entraron igual sin responder: las recoge el barrido de
            // admisión, y su prioridad es una suposición del sistema, no algo
            // que la persona haya dicho. A esas hay que llamarlas.
            admitidasSinResponder: admitidas.filter((s) => s.triageResponses.length === 0).length,
          },
          esperaHastaLaPrimeraSesion: {
            diasMediana: mediana(diasHastaLaPrimeraSesion),
            diasPromedio: prom(diasHastaLaPrimeraSesion),
            sobreCuantasPersonas: diasHastaLaPrimeraSesion.length,
          },
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