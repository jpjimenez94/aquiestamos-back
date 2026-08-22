import { SupportRequestModel } from '../models/supportRequest.model.js'
import { TriageResponseModel } from '../models/triageResponse.model.js'
import { leerEnlaceTamizaje } from '../auth/enlaceTamizaje.js'
import { calcularPrioridad, exigeAvisoInmediato } from '../services/triage.service.js'
import { admitirPorTamizaje } from '../services/promotion.service.js'
import { tamizajeParaLaPersona } from '../views/triage.view.js'
import { ok, created, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { tamizajeRespondido, pacienteAdmitido } from '../notifications/eventos.js'

/**
 * CONTROLADOR: tamizaje.
 *
 * La persona que pidió acompañamiento responde siete preguntas desde el enlace
 * que le llega por WhatsApp, y de ahí sale la prioridad con la que se le
 * admite. Antes esa prioridad se elegía a ojo con lo único que trae el
 * formulario, que no dice cómo está hoy.
 *
 * Es una puerta pública, así que carga con lo mismo que el enlace de caso:
 *
 *   1. El token va firmado con vencimiento adentro y se compara en tiempo
 *      constante.
 *   2. La respuesta la arma una vista que nombra campo por campo lo que sale.
 *      Aquí es aún más corta: el nombre de pila y si ya respondió.
 *   3. Un enlace inventado y una solicitud borrada dan la misma respuesta.
 */

/** Busca la solicitud detrás del token, o null si el token no sirve. */
async function solicitudDelToken(token) {
  const datos = leerEnlaceTamizaje(token)
  if (!datos) return null

  const solicitud = await SupportRequestModel.findById(datos.solicitud)
  if (!solicitud) return null

  return solicitud
}

export const TriageController = {
  /** GET /api/triage/:token — qué mostrar al abrir el enlace. */
  async mostrar(req, res, next) {
    try {
      const solicitud = await solicitudDelToken(req.params.token)
      if (!solicitud) {
        return res
          .status(404)
          .json(failure('Este enlace ya no sirve. Escríbenos por WhatsApp y te mandamos uno nuevo.'))
      }

      const ultima = await TriageResponseModel.ultimaDe(solicitud.id)
      return res.json(ok(tamizajeParaLaPersona(solicitud, ultima)))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/triage/:token — guardar lo que respondió. */
  async responder(req, res, next) {
    try {
      const solicitud = await solicitudDelToken(req.params.token)
      if (!solicitud) {
        return res
          .status(404)
          .json(failure('Este enlace ya no sirve. Escríbenos por WhatsApp y te mandamos uno nuevo.'))
      }

      const input = req.validated
      const { prioridad, razones } = calcularPrioridad(input, {
        esMenor: solicitud.isMinor === true,
      })

      const respuesta = await TriageResponseModel.create({
        supportRequestId: solicitud.id,
        safePlace: input.safePlace,
        distress: input.distress,
        sleepAndEat: input.sleepAndEat,
        dailyFunction: input.dailyFunction,
        hasSupport: input.hasSupport,
        selfHarmThoughts: input.selfHarmThoughts,
        howSoon: input.howSoon,
        availableDays: input.availableDays,
        availableSlots: input.availableSlots,
        preferredModality: input.preferredModality,
        suggestedPriority: prioridad,
        reasons: razones,
        consentVersion: input.consentVersion,
        sensitiveDataConsent: input.sensitiveDataConsent,
      })

      /**
       * Y se admite sola, con esa prioridad.
       *
       * Va en `try` aparte porque la respuesta de la persona YA está guardada:
       * si la admisión falla, lo que no puede pasar es que se le diga "no
       * pudimos" a alguien que sí contestó. La solicitud se queda en la
       * bandeja marcada como respondida y sin admitir, que es visible y
       * recuperable; perder la respuesta no lo sería.
       */
      let admision = null
      try {
        admision = await admitirPorTamizaje({
          supportRequestId: solicitud.id,
          prioridad,
          // Lo que acaba de decir sobre cuándo puede pisa a lo que trajo la
          // solicitud, que casi siempre venía vacío. Es el dato más fresco y
          // es el que va a leer el profesional en la propuesta.
          disponibilidad: {
            availableDays: input.availableDays,
            availableSlots: input.availableSlots,
            preferredModality: input.preferredModality,
          },
        })
      } catch (error) {
        console.error('[tamizaje] no se pudo admitir automáticamente:', error.message)
      }

      if (admision?.nuevo) await pacienteAdmitido(admision.paciente)
      await tamizajeRespondido({ solicitud, respuesta })

      // El rastro NO guarda las respuestas: son datos de salud y ya están en
      // su tabla. Queda que se respondió y con qué prioridad salió.
      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'Tamizaje',
        entityId: respuesta.id,
        after: { solicitud: solicitud.id, prioridad, admitida: Boolean(admision) },
      })

      /**
       * Si el tamizaje MOVIÓ la prioridad de alguien que ya estaba admitido,
       * eso va aparte y contra el paciente.
       *
       * Es un cambio que nadie ordenó y que reordena la cola de espera: sin
       * esta línea, quien mire la ficha vería una prioridad distinta a la de
       * ayer sin ninguna forma de saber quién la cambió ni por qué.
       */
      if (admision && !admision.nuevo && admision.prioridadAnterior) {
        await registrar({
          req,
          action: ACCION.EDITAR,
          entity: 'paciente',
          entityId: admision.paciente.id,
          before: { prioridad: admision.prioridadAnterior },
          after: { prioridad, porTamizaje: respuesta.id },
        })
      }

      return res.status(201).json(
        created(
          {
            // A la persona no se le dice en qué prioridad quedó: no es
            // información suya y "quedaste en baja" se lee como un portazo.
            urgente: exigeAvisoInmediato(input),
          },
          'Gracias por responder. Ya sabemos cómo acompañarte.',
        ),
      )
    } catch (error) {
      return next(error)
    }
  },
}

