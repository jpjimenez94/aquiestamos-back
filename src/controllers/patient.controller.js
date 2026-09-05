import { puede } from '../auth/permissions.js'
import { PatientModel } from '../models/patient.model.js'
import { PatientNoteModel } from '../models/patientNote.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { CaseReportModel } from '../models/caseReport.model.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { cita } from '../views/appointment.view.js'
import { crearEnlaceEncuesta } from '../auth/enlaceEncuesta.js'
import { crearEnlaceAgenda } from '../auth/enlaceAgenda.js'
import { crearEnlaceFeedback } from '../auth/enlaceFeedback.js'
import { env } from '../config/env.js'
import { prisma } from '../config/database.js'
import { admitirSolicitud } from '../services/promotion.service.js'
import { reporte } from '../views/caseReport.view.js'
import { reporteDeLaCita } from '../services/appointmentState.service.js'
import { pacienteAdmitido } from '../notifications/eventos.js'
import { candidatosPara } from '../services/matching.service.js'
import { franjasEnPalabras } from '../services/scheduling.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { pacienteLista, pacienteSegunRol } from '../views/patient.view.js'
import { profesionalConCarga } from '../views/professional.view.js'
import {
  ETIQUETAS as ETIQUETAS_ASIGNACION,
  SIGUIENTE_PASO,
} from '../services/assignmentState.service.js'
import {
  ETIQUETAS_FEEDBACK_SENTIR,
  ETIQUETAS_FEEDBACK_TRATO,
  ETIQUETAS_FEEDBACK_HERRAMIENTAS,
  ETIQUETAS_FEEDBACK_CALIDAD_SESION,
  ETIQUETAS_FEEDBACK_CONTINUAR,
} from '../catalogos.js'

export const PatientController = {
  /** GET /api/patients */
  async index(req, res, next) {
    try {
      const pacientes = req.query.sinAsignar === 'true'
        ? await PatientModel.findSinAsignar()
        : await PatientModel.findAll({
            status: req.query.status || undefined,
            city: req.query.city || undefined,
          })

      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'paciente',
        after: { total: pacientes.length, filtro: req.query.status ?? 'todos' },
      })

      return res.json(ok(pacienteLista(pacientes, req.usuario), { total: pacientes.length }))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/patients/:id */
  async show(req, res, next) {
    try {
      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(paciente.id)

      /**
       * Y por quién pasó antes, con el motivo de cada salida.
       *
       * La ficha solo leía la asignación viva. Al reasignar, el profesional
       * anterior, la fecha y el porqué desaparecían de la pantalla: quedaban en
       * `closeReason` y en la auditoría, que nadie abre sin saber ya qué
       * buscar. Quien coordina veía un caso «sin nada registrado» en el paso 3
       * aunque hubiera pasado por tres personas.
       */
      const historial = await CaseAssignmentModel.findCerradasDePaciente(paciente.id)

      // Lo que haya reportado quien acompaña, aunque la persona haya pasado
      // por más de un profesional: el histórico completo es lo que permite
      // ver si un caso se quedó estancado.
      const reportes = await CaseReportModel.findDePaciente(paciente.id)

      // Las citas van en la misma ficha: quien coordina no debería tener que
      // irse a la agenda a buscar cuándo es. La vista ya trae la hora en
      // Bogotá y quién es el profesional.
      const citas = await AppointmentModel.findDePaciente(paciente.id)

      /**
       * Retroalimentación directa de la persona sobre sus sesiones (formulario breve de experiencia).
       */
      const feedbacks = await prisma.patientFeedback.findMany({
        where: { patientId: paciente.id },
        orderBy: { createdAt: 'desc' },
        include: { assignment: { include: { professional: { select: { fullName: true } } } } },
      })
      const enlaceFeedback = `${env.sitioUrl.replace(/\/$/, '')}/experiencia/${crearEnlaceFeedback(paciente.id)}`

      /**
       * El enlace con el que la persona agenda sus propias sesiones.
       *
       * Se genera aquí y no se guarda en la base porque es determinista: sale
       * de su id y del secreto, así que se reconstruye igual cada vez. Eso
       * importa — el enlace que se le mandó por WhatsApp el primer día es el
       * mismo que ve la coordinación hoy, y no hay dos versiones que puedan
       * discrepar.
       *
       * Va siempre, incluso antes de que tenga profesional: en ese caso la
       * pantalla se lo dice y le pide guardarlo, en vez de fallar.
       */
      const enlaceAgenda = `${env.sitioUrl.replace(/\/$/, '')}/agenda/${crearEnlaceAgenda(paciente.id)}`

      /**
       * Con el caso cerrado, la ficha trae la encuesta: el enlace para
       * mandársela a la persona por WhatsApp y, si ya respondió, lo que dijo.
       * El enlace sale de SITIO_URL, como todos.
       */
      let encuesta = null
      if (paciente.status === 'CERRADO') {
        const cerrada = await prisma.caseAssignment.findFirst({
          where: { patientId: paciente.id, status: 'CERRADA', deletedAt: null },
          orderBy: { endedAt: 'desc' },
          include: { survey: true },
        })
        if (cerrada) {
          encuesta = {
            enlace: `${env.sitioUrl.replace(/\/$/, '')}/encuesta/${crearEnlaceEncuesta(cerrada.id)}`,
            respondida: cerrada.survey != null,
            ayudo: cerrada.survey?.helped ?? null,
            recomendaria: cerrada.survey?.wouldRecommend ?? null,
            comentario: cerrada.survey?.comment ?? null,
          }
        }
      }

      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'paciente',
        entityId: paciente.id,
      })

      return res.json(
        ok({
          ...pacienteSegunRol(paciente, req.usuario),
          /**
           * La negociación con el profesional, no solo "quién lo lleva".
           *
           * El estado es lo que decide qué botón se le enseña a quien
           * coordina: proponer, escribirle a la persona, o hacer seguimiento.
           * Sin esto, el portal solo sabía decir "asignado" y el resto vivía
           * en el historial de WhatsApp de alguien.
           */
          asignacion: asignacion
            ? {
                id: asignacion.id,
                estado: asignacion.status,
                estadoLegible: ETIQUETAS_ASIGNACION[asignacion.status] ?? asignacion.status,
                siguientePaso: SIGUIENTE_PASO[asignacion.status] ?? null,
                desde: asignacion.startedAt,
                respondioEn: asignacion.respondedAt,
                /**
                 * Si el profesional ya dijo que puede, y quién lo dio por dicho.
                 *
                 * El paso 4 —mandarle a la persona su enlace de agenda— espera
                 * a esto: ella elige de la agenda de él, y ofrecérsela antes de
                 * que él confirme que sigue vigente es exponerla a reservar un
                 * espacio que ya no existe.
                 *
                 * `confirmadoPor` con valor significa que lo desbloqueó
                 * coordinación porque él respondió por otro medio.
                 */
                confirmadoEn: asignacion.professionalConfirmedAt,
                confirmadoPor: asignacion.confirmedByEmail,
                // Lo que el profesional puso él mismo desde su enlace.
                nota: asignacion.availabilityNote,
                motivoRechazo: asignacion.declineReason,
                profesional: {
                  id: asignacion.professional.id,
                  nombre: asignacion.professional.fullName,
                  // Para armar el enlace de WhatsApp desde el portal.
                  telefono: asignacion.professional.phone,
                  /**
                   * Su agenda, en palabras, para poder ponérsela en el aviso.
                   *
                   * El mensaje del paso 3 le dice que la persona va a elegir
                   * «entre los espacios que ya tienes marcados como libres», y
                   * él nunca ha visto esos espacios: su agenda la mantiene
                   * coordinación desde la ficha, y no tiene cuenta en el portal
                   * para mirarla. Pedirle que acepte un caso sobre una
                   * disponibilidad que no puede ver es pedirle una firma a
                   * ciegas — y es de donde salen las cancelaciones tardías.
                   */
                  // Una línea por día: en el WhatsApp, siete días separados por
                  // comas dejan de leerse a partir del tercero.
                  agenda: await franjasEnPalabras(asignacion.professional.id, {
                    separador: '\n· ',
                  }),
                },
              }
            : null,
          /**
           * Por quién pasó antes. El detalle completo está en la auditoría; esto
           * es lo justo para saber que existió y poder ir a mirarlo.
           */
          historialAsignaciones: historial.map((h) => ({
            id: h.id,
            estado: h.status,
            estadoLegible: ETIQUETAS_ASIGNACION[h.status] ?? h.status,
            profesional: h.professional?.fullName ?? null,
            profesionalId: h.professional?.id ?? null,
            desde: h.startedAt,
            hasta: h.endedAt,
            // Los dos porqués: `declineReason` lo escribe él al declinar,
            // `closeReason` lo escribe quien cierra o el barrido al liberar.
            motivo: h.declineReason ?? h.closeReason ?? null,
          })),
          /**
           * Cada nota dice de qué sesión es, y cada sesión sabe si tiene nota.
           *
           * Los reportes cuelgan de la asignación, no de la cita: la ficha
           * enseñaba tres citas arriba y una nota abajo sin decir de cuál era,
           * y quien coordina tenía que adivinarlo por la fecha. El
           * emparejamiento —la primera nota escrita después de que empezara la
           * sesión— ya existía para el informe; aquí se reutiliza, no se
           * reinventa: dos reglas para lo mismo es como acaban diciendo cosas
           * distintas.
           */
          reportes: reportes.map((r) => {
            const suya = citas.find((c) => reporteDeLaCita(c, reportes, citas)?.id === r.id)
            return {
              ...reporte(r),
              profesional: r.assignment?.professional?.fullName ?? null,
              citaId: suya?.id ?? null,
              citaInicio: suya?.startsAt ?? null,
            }
          }),
          feedbacks: feedbacks.map((f) => ({
            id: f.id,
            howFelt: f.howFelt,
            howFeltLegible: ETIQUETAS_FEEDBACK_SENTIR[f.howFelt] ?? f.howFelt,
            respectfulTreatment: f.respectfulTreatment,
            respectfulTreatmentLegible: f.respectfulTreatment ? (ETIQUETAS_FEEDBACK_TRATO[f.respectfulTreatment] ?? f.respectfulTreatment) : null,
            gotTools: f.gotTools,
            gotToolsLegible: f.gotTools ? (ETIQUETAS_FEEDBACK_HERRAMIENTAS[f.gotTools] ?? f.gotTools) : null,
            sessionQuality: f.sessionQuality,
            sessionQualityLegible: f.sessionQuality ? (ETIQUETAS_FEEDBACK_CALIDAD_SESION[f.sessionQuality] ?? f.sessionQuality) : null,
            wantsToContinue: f.wantsToContinue,
            wantsToContinueLegible: ETIQUETAS_FEEDBACK_CONTINUAR[f.wantsToContinue] ?? f.wantsToContinue,
            comment: f.comment,
            profesional: f.assignment?.professional?.fullName ?? null,
            createdAt: f.createdAt,
          })),
          enlaceFeedback,
          enlaceAgenda,
          citas: citas.map((c) => ({ ...cita(c), reporteId: reporteDeLaCita(c, reportes, citas)?.id ?? null })),
          encuesta,
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/patients/admitir/:supportRequestId */
  async admitir(req, res, next) {
    try {
      const paciente = await admitirSolicitud({
        supportRequestId: req.params.supportRequestId,
        ajustes: req.validated,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'paciente',
        entityId: paciente.id,
        after: { desdeSolicitud: req.params.supportRequestId, prioridad: paciente.priority },
      })

      await pacienteAdmitido(paciente)

      return res
        .status(201)
        .json(created(pacienteSegunRol(paciente, req.usuario), 'Persona admitida. Ya se le puede asignar profesional.'))
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/patients/:id */
  async update(req, res, next) {
    try {
      const anterior = await PatientModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Persona no encontrada'))

      const paciente = await PatientModel.update(req.params.id, req.validated)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'paciente',
        entityId: paciente.id,
        before: pacienteSegunRol(anterior, req.usuario),
        after: pacienteSegunRol(paciente, req.usuario),
      })

      return res.json(ok(pacienteSegunRol(paciente, req.usuario)))
    } catch (error) {
      next(error)
    }
  },

  /** DELETE /api/patients/:id */
  async destroy(req, res, next) {
    try {
      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(paciente.id)
      if (asignacion) {
        if (puede(req.usuario, 'paciente:borrar')) {
          await CaseAssignmentModel.cancelar(
            asignacion.id,
            'Registro eliminado por administración',
          )
        } else {
          return res
            .status(409)
            .json(failure('Cierra primero el acompañamiento activo de esta persona.'))
        }
      }

      await PatientModel.softDelete(paciente.id)

      /**
       * Su solicitud vuelve a la cola.
       *
       * Sin esto, quien pidió ayuda desaparecía. La solicitud se quedaba en
       * EN_REVISION —así que no volvía a Solicitudes, porque el sistema la daba
       * por atendida— y la persona quedaba borrada —así que tampoco salía en
       * «Por asignar»—. Ni un error, ni un aviso: simplemente dejaba de estar
       * en las dos pantallas donde alguien la habría visto.
       *
       * Borrar una persona es decir «esta admisión no debía existir»: un
       * duplicado, un registro de prueba, un dato mal metido. Lo que NO
       * significa es que quien escribió pidiendo ayuda deje de existir, así que
       * la solicitud retrocede un paso y vuelve a estar sobre la mesa.
       *
       * Se comprueba que siga viva: si alguien borró también la solicitud, es
       * que quiso borrar las dos cosas y ahí no hay nada que rescatar.
       */
      let solicitudDevuelta = false
      if (paciente.supportRequestId) {
        const solicitud = await prisma.supportRequest.findUnique({
          where: { id: paciente.supportRequestId },
          select: { id: true, status: true, deletedAt: true },
        })

        if (solicitud && !solicitud.deletedAt && solicitud.status !== 'DESCARTADO') {
          await prisma.supportRequest.update({
            where: { id: solicitud.id },
            data: { status: 'NUEVO' },
          })

          /**
           * Y se le suelta el enlace a la persona borrada.
           *
           * `supportRequestId` es ÚNICO: una solicitud, una persona. El
           * registro borrado seguía ocupando ese sitio, así que al admitir de
           * nuevo la creación chocaba contra la restricción y la pantalla
           * respondía «Ese registro ya existe» — un mensaje de base de datos
           * para un problema que quien coordina no puede ni entender ni
           * resolver.
           *
           * Devolver la solicitud a la cola sin soltar el enlace era dejarla
           * visible pero inservible, que es casi peor que no verla: se ve, se
           * pulsa, y no pasa nada.
           *
           * El registro borrado conserva todo lo demás —es el rastro de que
           * esa admisión existió— y solo pierde el vínculo, que ya no le sirve
           * a nadie.
           */
          await PatientModel.update(paciente.id, { supportRequestId: null })
          solicitudDevuelta = true
        }
      }

      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'paciente',
        entityId: paciente.id,
        before: pacienteSegunRol(paciente, req.usuario),
        // Queda dicho en el rastro: no es lo mismo borrar a alguien y dejar su
        // solicitud sobre la mesa que borrarlo del todo.
        after: { solicitudDevueltaALaCola: solicitudDevuelta },
      })

      return res.json(
        ok(
          { eliminado: true, id: paciente.id, solicitudDevuelta },
          solicitudDevuelta
            ? 'Registro eliminado. Su solicitud vuelve a Solicitudes para admitirla de nuevo.'
            : 'Registro eliminado.',
        ),
      )
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/patients/:id/candidatos — la pantalla de emparejamiento */
  async candidatos(req, res, next) {
    try {
      const poblaciones = req.query.poblaciones
        ? String(req.query.poblaciones).split(',').map((p) => p.trim()).filter(Boolean)
        : undefined

      const { paciente, candidatos } = await candidatosPara({
        patientId: req.params.id,
        poblaciones,
      })

      return res.json(
        ok({
          paciente: pacienteSegunRol(paciente, req.usuario),
          candidatos: candidatos.map((c) => profesionalConCarga(c, req.usuario)),
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/patients/:id/notes — Agregar nota de seguimiento */
  async agregarNota(req, res, next) {
    try {
      const { note } = req.body
      if (!note || typeof note !== 'string' || !note.trim()) {
        return res.status(400).json(failure('La nota no puede estar vacía'))
      }

      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const authorName = req.usuario?.fullName || req.usuario?.email || 'Coordinación'
      const authorEmail = req.usuario?.email || 'sistema'

      const nuevaNota = await PatientNoteModel.create({
        patientId: paciente.id,
        note: note.trim(),
        authorName,
        authorEmail,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'paciente_nota',
        entityId: nuevaNota.id,
        after: {
          pacienteId: paciente.id,
          pacienteNombre: paciente.fullName,
          nota: nuevaNota.note,
          autor: authorName,
        },
      })

      const notas = await PatientNoteModel.findDePaciente(paciente.id)

      return res.status(201).json(
        created({
          nota: {
            id: nuevaNota.id,
            nota: nuevaNota.note,
            autor: nuevaNota.authorName,
            email: nuevaNota.authorEmail,
            fecha: nuevaNota.createdAt,
          },
          notas: notas.map((n) => ({
            id: n.id,
            nota: n.note,
            autor: n.authorName,
            email: n.authorEmail,
            fecha: n.createdAt,
          })),
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/patients/:id/notes — Listar notas de seguimiento */
  async obtenerNotas(req, res, next) {
    try {
      const paciente = await PatientModel.findById(req.params.id)
      if (!paciente) return res.status(404).json(failure('Persona no encontrada'))

      const notas = await PatientNoteModel.findDePaciente(paciente.id)

      return res.json(
        ok(
          notas.map((n) => ({
            id: n.id,
            nota: n.note,
            autor: n.authorName,
            email: n.authorEmail,
            fecha: n.createdAt,
          })),
        ),
      )
    } catch (error) {
      next(error)
    }
  },
}
