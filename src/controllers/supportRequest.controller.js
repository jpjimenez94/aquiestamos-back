import { SupportRequestModel } from '../models/supportRequest.model.js'
import { created, ok, failure } from '../views/response.view.js'
import { solicitudRecibida } from '../notifications/eventos.js'
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

      await solicitudRecibida(request)

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
      const page = Math.max(1, Number(req.query.page ?? 1))
      const perPage = Math.min(100, Math.max(1, Number(req.query.perPage ?? 50)))
      const status = req.query.status || undefined

      const [requests, total] = await Promise.all([
        SupportRequestModel.findAll({ skip: (page - 1) * perPage, take: perPage, status }),
        SupportRequestModel.count({ status }),
      ])

      // Con datos de salud interesa saber también quién CONSULTA, no solo
      // quién edita. Se guarda el hecho y el filtro, nunca el contenido.
      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'solicitud',
        after: { page, perPage, total, status: status ?? 'todos' },
      })

      return res.json(
        ok(supportRequestListaSegunRol(requests, req.usuario), { page, perPage, total }),
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

