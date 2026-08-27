import { primerNombre as pila } from '../nombre.js'
import { prisma } from '../config/database.js'
import { leerEnlaceEncuesta } from '../auth/enlaceEncuesta.js'
import { ok, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'

/**
 * CONTROLADOR: la encuesta breve tras el cierre.
 *
 * Dos preguntas y un campo opcional, por enlace con token. Es el único dato
 * de resultado que la red tiene, y por eso mismo es VOLUNTARIA de verdad: no
 * responderla no tiene ninguna consecuencia para la persona.
 *
 * Puerta pública con las mismas reglas de siempre: token firmado, respuestas
 * idénticas para un token inventado y una asignación borrada, y una vista que
 * solo enseña el nombre de pila.
 */

async function asignacionDelToken(token) {
  const datos = leerEnlaceEncuesta(token)
  if (!datos) return null

  return prisma.caseAssignment.findFirst({
    where: { id: datos.asignacion, status: 'CERRADA', deletedAt: null },
    include: {
      patient: { select: { fullName: true } },
      professional: { select: { fullName: true } },
      survey: true,
    },
  })
}

function vista(asignacion) {
  return {
    persona: pila(asignacion.patient?.fullName),
    profesional: pila(asignacion.professional?.fullName),
    yaRespondida: asignacion.survey != null,
  }
}

export const EncuestaController = {
  /** GET /api/encuesta/:token — qué mostrar al abrir el enlace. */
  async mostrar(req, res, next) {
    try {
      const asignacion = await asignacionDelToken(req.params.token)
      if (!asignacion) {
        return res.status(404).json(failure('Este enlace ya no sirve, y no pasa nada: la encuesta era opcional.'))
      }
      return res.json(ok(vista(asignacion)))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/encuesta/:token — guardar lo que respondió. */
  async responder(req, res, next) {
    try {
      const asignacion = await asignacionDelToken(req.params.token)
      if (!asignacion) {
        return res.status(404).json(failure('Este enlace ya no sirve, y no pasa nada: la encuesta era opcional.'))
      }

      // Responder dos veces es la misma persona recargando: se agradece igual.
      if (asignacion.survey) {
        return res.json(ok(vista(asignacion), 'Ya la habíamos recibido. Gracias de nuevo.'))
      }

      const { helped, wouldRecommend, comment } = req.validated

      await prisma.closureSurvey.create({
        data: {
          assignmentId: asignacion.id,
          helped,
          wouldRecommend,
          comment: comment?.trim() || null,
        },
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'encuesta',
        entityId: asignacion.id,
        after: { helped, wouldRecommend, desdeEnlace: true },
      })

      return res.json(
        ok({ ...vista(asignacion), yaRespondida: true }, 'Gracias por contarnos. Nos ayuda a acompañar mejor.'),
      )
    } catch (error) {
      return next(error)
    }
  },
}
