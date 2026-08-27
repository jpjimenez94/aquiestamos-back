import { primerNombre as pila } from '../nombre.js'
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

export const FeedbackController = {
  /** GET /api/experiencia/:token */
  async mostrar(req, res, next) {
    try {
      const paciente = await pacienteDelToken(req.params.token)
      if (!paciente) {
        return res.status(404).json(failure('Este enlace ya no sirve o no es válido.'))
      }

      const asignacion = paciente.assignments?.[0]

      // Solo el nombre de pila, como en el resto de las puertas sin sesión.
      //
      // Esto mandaba también `nombreCompletoPersona` y
      // `nombreCompletoProfesional`, que el formulario declaraba en su tipo y
      // no usaba en ningún sitio: saluda con el nombre de pila y ya. Eran dos
      // nombres completos —el de alguien que recibió atención psicológica y el
      // de quien se la dio— viajando en una respuesta pública, sin que nadie
      // los pidiera, en un enlace que vive 60 días.
      return res.json(
        ok({
          persona: pila(paciente.fullName),
          profesional: pila(asignacion?.professional?.fullName),
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
      const { howFelt, respectfulTreatment, gotTools, sessionQuality, wantsToContinue, comment } = req.validated

      const feedback = await prisma.patientFeedback.create({
        data: {
          patientId: paciente.id,
          assignmentId: asignacion?.id ?? null,
          howFelt,
          respectfulTreatment: respectfulTreatment || null,
          gotTools: gotTools || null,
          sessionQuality: sessionQuality || null,
          wantsToContinue,
          comment: comment?.trim() || null,
        },
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'paciente_feedback',
        entityId: feedback.id,
        after: { patientId: paciente.id, howFelt, respectfulTreatment, gotTools, sessionQuality, wantsToContinue, desdeEnlace: true },
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
