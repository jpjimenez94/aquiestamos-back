import { AppointmentModel } from '../models/appointment.model.js'
import { leerEnlaceConsentimiento } from '../auth/enlaceConsentimiento.js'
import { formatearLocal } from '../services/timezone.service.js'
import { ok, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'

/**
 * CONTROLADOR: consentimiento informado de una cita.
 *
 * La persona firma desde el enlace que le llega por WhatsApp antes de su
 * sesión. Antes el mensaje la mandaba a una página que no existía y sin
 * token: nadie podía firmar nada, y "registrar el consentimiento" era que
 * coordinación subiera un PDF a mano.
 *
 * Es una puerta pública y carga con lo mismo que el tamizaje: token firmado
 * con vencimiento adentro, comparación en tiempo constante, respuestas
 * idénticas para un token inventado y una cita borrada, y una vista que solo
 * enseña lo mínimo para decidir: con quién es la sesión, cuándo, y el nombre
 * de pila de quien firma.
 */

/** Busca la cita detrás del token, o null si el token no sirve. */
async function citaDelToken(token) {
  const datos = leerEnlaceConsentimiento(token)
  if (!datos) return null
  return AppointmentModel.findById(datos.cita)
}

/** Solo el nombre de pila: la puerta pública no enseña más. */
function pila(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] || null
}

function vista(cita) {
  return {
    persona: pila(cita.patient?.fullName),
    esMenor: cita.patient?.isMinor ?? false,
    profesional: cita.professional?.fullName ?? null,
    cuando: formatearLocal(cita.startsAt),
    modalidad: cita.modality,
    firmado: cita.consentSigned === true,
    firmadoEl: cita.consentSignedAt,
  }
}

export const ConsentimientoController = {
  /** GET /api/consentimiento/:token — qué mostrar al abrir el enlace. */
  async mostrar(req, res, next) {
    try {
      const cita = await citaDelToken(req.params.token)
      if (!cita) {
        return res
          .status(404)
          .json(failure('Este enlace ya no sirve. Escríbenos por WhatsApp y te mandamos uno nuevo.'))
      }

      return res.json(ok(vista(cita)))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/consentimiento/:token — la persona (o su acudiente) acepta. */
  async firmar(req, res, next) {
    try {
      const cita = await citaDelToken(req.params.token)
      if (!cita) {
        return res
          .status(404)
          .json(failure('Este enlace ya no sirve. Escríbenos por WhatsApp y te mandamos uno nuevo.'))
      }

      // Firmar dos veces no es un error: es la misma persona recargando la
      // página. Se le responde lo mismo y no se pisa la fecha original.
      if (cita.consentSigned) {
        return res.json(ok(vista(cita), 'Ya estaba firmado. Todo listo para tu sesión.'))
      }

      const actualizada = await AppointmentModel.update(cita.id, {
        consentSigned: true,
        consentSignedAt: new Date(),
      })

      /**
       * Quién firmó queda en la auditoría, no en la cita: el nombre que
       * teclea la persona es su firma, y la firma es un hecho que se
       * registra, no un dato que se edita después.
       */
      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'cita_consentimiento',
        entityId: cita.id,
        actorEmail: cita.patient?.email || (cita.patient?.fullName ? `${cita.patient.fullName} (persona)` : 'persona'),
        after: {
          consentSigned: true,
          firma: req.validated.nombreFirma,
          version: req.validated.version,
          desdeEnlace: true,
        },
      })

      return res.json(ok(vista(actualizada), 'Gracias. Quedó firmado; nos vemos en la sesión.'))
    } catch (error) {
      return next(error)
    }
  },
}
