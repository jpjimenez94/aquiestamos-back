import { SupportRequestModel } from '../models/supportRequest.model.js'
import { TriageResponseModel } from '../models/triageResponse.model.js'
import { calcularPrioridad } from '../services/triage.service.js'
import { admitirPorTamizaje, DIAS_SIN_RESPUESTA } from '../services/promotion.service.js'
import { crearEnlaceTamizaje } from '../auth/enlaceTamizaje.js'
import { env } from '../config/env.js'
import { created, ok, failure } from '../views/response.view.js'
import { solicitudRecibida, pacienteAdmitido, tamizajeRespondido } from '../notifications/eventos.js'
import { registrar, ACCION } from '../services/audit.service.js'
import {
  supportRequestReceipt,
  supportRequestListaSegunRol,
} from '../views/supportRequest.view.js'

export const SupportRequestController = {
  async store(req, res, next) {
    try {
      const input = req.validated
      const paraOtra = input.forWhom === 'PARA_OTRA_PERSONA'

      const request = await SupportRequestModel.create({
        forWhom: input.forWhom,
        isMinor: paraOtra ? input.isMinor : null,
        relationship: paraOtra ? input.relationship || null : null,
        contactName: paraOtra ? input.contactName || null : null,

        name: input.name,
        phone: input.phone,
        email: input.email || null,
        preferredContact: input.preferredContact,
        city: input.city,

        preferredModality: input.preferredModality,
        availableDays: input.availableDays,
        availableSlots: input.availableSlots,
        message: input.message || null,

        consentVersion: input.consentVersion,
        dataConsent: input.dataConsent,
        sensitiveDataConsent: input.sensitiveDataConsent,
        guardianConsent: input.isMinor === true ? input.guardianConsent : false,
        communicationsConsent: input.communicationsConsent,
      })

      // Si el formulario incluyó las preguntas de triaje prioritario, guardar TriageResponse y admitir de inmediato
      if (input.distress !== undefined && input.distress !== null) {
        let howSoonNormalizado = 'ESTA_SEMANA'
        if (input.howSoon === 'HOY') {
          howSoonNormalizado = 'HOY'
        } else if (input.howSoon === 'PUEDO_ESPERAR') {
          howSoonNormalizado = 'PUEDO_ESPERAR'
        } else if (input.howSoon === 'ESTA_SEMANA' || input.howSoon === 'PROXIMOS_DIAS') {
          howSoonNormalizado = 'ESTA_SEMANA'
        }

        const triageData = {
          safePlace: input.safePlace ?? true,
          distress: Number(input.distress),
          sleepAndEat: input.sleepAndEat || 'SI',
          dailyFunction: input.dailyFunction || 'SI',
          hasSupport: input.hasSupport ?? true,
          selfHarmThoughts: Boolean(input.selfHarmThoughts),
          howSoon: howSoonNormalizado,
          availableDays: input.availableDays || [],
          availableSlots: input.availableSlots || [],
          preferredModality: input.preferredModality || null,
          consentVersion: input.consentVersion,
          sensitiveDataConsent: input.sensitiveDataConsent,
        }

        const { prioridad, razones } = calcularPrioridad(triageData, {
          esMenor: input.isMinor === true,
        })

        const respuesta = await TriageResponseModel.create({
          supportRequestId: request.id,
          ...triageData,
          suggestedPriority: prioridad,
          reasons: razones,
        })

        // Admisión automática inmediata: como ya tiene triaje y prioridad, se admite sola
        let admision = null
        try {
          admision = await admitirPorTamizaje({
            supportRequestId: request.id,
            prioridad,
            disponibilidad: {
              availableDays: input.availableDays || [],
              availableSlots: input.availableSlots || [],
              preferredModality: input.preferredModality || null,
            },
          })
        } catch (error) {
          console.error('[solicitud] no se pudo admitir automáticamente:', error.message)
        }

        if (admision?.nuevo) await pacienteAdmitido(admision.paciente)
        await tamizajeRespondido({ solicitud: request, respuesta })
      } else {
        await solicitudRecibida(request)
      }

      return res
        .status(201)
        .json(
          created(
            supportRequestReceipt(request),
            'Recibimos tus datos. Un profesional de la red te contactará muy pronto.',
          ),
        )
    } catch (error) {
      next(error)
    }
  },

  async index(req, res, next) {
    try {
      const all = req.query.all === 'true' || req.query.todos === 'true' || req.query.perPage === 'all'
      const page = Math.max(1, Number(req.query.page ?? 1))
      const perPage = all ? undefined : Math.min(500, Math.max(1, Number(req.query.perPage ?? 50)))
      const status = req.query.status || undefined

      const [requests, total] = await Promise.all([
        SupportRequestModel.findAll({
          skip: all ? undefined : (page - 1) * perPage,
          take: all ? undefined : perPage,
          status,
        }),
        SupportRequestModel.count({ status }),
      ])

      // El tamizaje de cada fila: el enlace para mandárselo y, si ya respondió,
      // con qué prioridad salió. El enlace se firma aquí y no se guarda: es
      // deducible del id de la solicitud, así que almacenarlo sería una copia
      // más de lo mismo que puede quedar desactualizada.
      const ultimas = await TriageResponseModel.ultimaDeCada(requests.map((r) => r.id))
      const porSolicitud = new Map(ultimas.map((t) => [t.supportRequestId, t]))

      const ahora = new Date()

      const conTamizaje = requests.map((request) => {
        // Cuántos días le quedan antes de que el barrido la admita sola. Va
        // calculado aquí y no en el portal para que el número salga del mismo
        // umbral que usa el rescate: dos sitios contando días es un sitio
        // diciéndole al equipo algo que no va a pasar.
        const transcurridos = (ahora.getTime() - request.createdAt.getTime()) / 86400000
        const faltan = Math.max(0, Math.ceil(DIAS_SIN_RESPUESTA - transcurridos))

        /**
         * El enlace va COMPLETO y se arma con `SITIO_URL`, no con el origen
         * del navegador de quien coordina.
         *
         * Se armaba en el portal con `window.location.origin`, y eso significa
         * que quien abría el portal en su máquina de desarrollo le mandaba a
         * una persona en crisis un enlace a `localhost`, que desde su teléfono
         * no lleva a ninguna parte. Lo mismo con una URL de vista previa de
         * Vercel. El destino de ese enlace no depende de dónde esté mirando el
         * equipo: es el sitio público, y eso es configuración del servidor.
         */
        return {
          ...request,
          tamizaje: {
            enlace: `${env.sitioUrl.replace(/\/$/, '')}/tamizaje/${crearEnlaceTamizaje(request.id)}`,
            respuesta: porSolicitud.get(request.id) ?? null,
            diasParaAdmisionAutomatica: faltan,
          },
        }
      })

      // Con datos de salud interesa saber también quién CONSULTA, no solo
      // quién edita. Se guarda el hecho y el filtro, nunca el contenido.
      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'solicitud',
        after: { page, perPage: perPage ?? total, total, status: status ?? 'todos' },
      })

      return res.json(
        ok(supportRequestListaSegunRol(conTamizaje, req.usuario), { page: all ? 1 : page, perPage: all ? total : perPage, total }),
      )
    } catch (error) {
      next(error)
    }
  },

  /**
   * DELETE /api/support-requests/:id
   * Borrado lógico — solo ADMIN.
   * El registro permanece en base de datos para auditoría; únicamente se
   * establece `deletedAt` para que desaparezca de todas las consultas normales.
   */
  async destroy(req, res, next) {
    try {
      const { id } = req.params
      const existente = await SupportRequestModel.findById(id)

      if (!existente) {
        return res.status(404).json(failure('La solicitud no existe o ya fue eliminada'))
      }

      await SupportRequestModel.softDelete(id)

      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'solicitud',
        entityId: id,
        before: { status: existente.status, name: existente.name },
      })

      return res.json(ok(null, 'Solicitud eliminada correctamente'))
    } catch (error) {
      next(error)
    }
  },
}

