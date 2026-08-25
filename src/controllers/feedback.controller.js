import { prisma } from '../config/database.js'
import { leerEnlaceFeedback } from '../auth/enlaceFeedback.js'
import { ok, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ETIQUETAS_FEEDBACK_SENTIR, ETIQUETAS_FEEDBACK_CONTINUAR } from '../catalogos.js'

async function pacienteDelToken(token) {
  const datos = leerEnlaceFeedback(token)
  if (!datos) return null

  const paciente = await prisma.patient.findUnique({
    where: { id: datos.paciente },
    include: {
      assignments: {
        where: { status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA', 'CERRADA'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { professional: { select: { fullName: true } } },
      },
    },
  })

  if (!paciente) return null
  return paciente
}

function pila(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] || null
}

export const FeedbackController = {
  /** GET /api/experiencia/:token */
  async mostrar(req, res, next) {
    try {
      const paciente = await pacienteDelToken(req.params.token)
      if (!paciente) {
        return res.status(404).json(failure('Este enlace ya no sirve o no es válido.'))
      }

      const asignacion = paciente.assignments?.[0]
      return res.json(
        ok({
          persona: pila(paciente.fullName),
          nombreCompletoPersona: paciente.fullName,
          profesional: asignacion?.professional?.fullName ? pila(asignacion.professional.fullName) : null,
          nombreCompletoProfesional: asignacion?.professional?.fullName ?? null,
        }),
      )
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/experiencia/:token */
  async responder(req, res, next) {
    try {
      const paciente = await pacienteDelToken(req.params.token)
      if (!paciente) {
        return res.status(404).json(failure('Este enlace ya no sirve o no es válido.'))
      }

      const asignacion = paciente.assignments?.[0]
      const { howFelt, wantsToContinue, comment } = req.validated

      const feedback = await prisma.patientFeedback.create({
        data: {
          patientId: paciente.id,
          assignmentId: asignacion?.id ?? null,
          howFelt,
          wantsToContinue,
          comment: comment?.trim() || null,
        },
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'paciente_feedback',
        entityId: feedback.id,
        after: { patientId: paciente.id, howFelt, wantsToContinue, desdeEnlace: true },
      })

      return res.json(
        ok(
          {
            id: feedback.id,
            persona: pila(paciente.fullName),
          },
          'Gracias por contarnos tu experiencia. Nos ayuda a cuidarte y acompañarte mejor.',
        ),
      )
    } catch (error) {
      return next(error)
    }
  },
}
