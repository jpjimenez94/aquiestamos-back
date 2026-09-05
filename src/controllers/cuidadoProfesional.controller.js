import { leerEnlaceCuidado } from '../auth/enlaceCuidado.js'
import { prisma } from '../config/database.js'
import { primerNombre } from '../nombre.js'
import {
  estadoDeCuidado,
  crearCheckIn,
  ETIQUETAS_NECESIDAD,
} from '../services/cuidado.service.js'
import { checkInRecibido } from '../notifications/eventos.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'

/**
 * CONTROLADOR: «¿Cómo estás tú?», la puerta del profesional.
 *
 * Es una puerta pública y carga con lo mismo que las otras: token firmado con
 * vencimiento adentro, límite de peticiones, y una respuesta idéntica para un
 * token inventado y un profesional borrado.
 *
 * De quién es el espacio lo decide el token, nunca la URL. Vivía dentro del
 * enlace del caso —con el token de un paciente— y eso lo ataba a una persona
 * acompañada; el espacio es de quien acompaña, y ahora tiene su propia puerta.
 */

/** El profesional detrás del token, o null si el token no sirve. */
async function profesionalDelToken(token) {
  const datos = leerEnlaceCuidado(token)
  if (!datos) return null
  const p = await prisma.professional.findUnique({
    where: { id: datos.profesional },
    select: { id: true, fullName: true, email: true, status: true, deletedAt: true },
  })
  if (!p || p.deletedAt || p.status !== 'ACTIVO') return null
  return p
}

const NO_SIRVE = 'Este enlace ya no sirve. Escríbenos por WhatsApp y te mandamos uno nuevo.'

export const CuidadoProfesionalController = {
  /** GET /api/cuidado-profesional/:token — cuántas sesiones lleva y si se le abre el espacio. */
  async mostrar(req, res, next) {
    try {
      const profesional = await profesionalDelToken(req.params.token)
      if (!profesional) return res.status(404).json(failure(NO_SIRVE))

      const estado = await estadoDeCuidado(profesional.id)
      return res.json(ok({ ...estado, nombre: primerNombre(profesional.fullName) }))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/cuidado-profesional/:token — «¿Cómo estás tú?». */
  async registrar(req, res, next) {
    try {
      const profesional = await profesionalDelToken(req.params.token)
      if (!profesional) return res.status(404).json(failure(NO_SIRVE))

      const checkIn = await crearCheckIn({ professionalId: profesional.id, ...req.validated })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'check_in',
        entityId: checkIn.id,
        actorEmail: profesional.email ?? `profesional:${profesional.id}`,
        after: { necesidad: checkIn.need, sesiones: checkIn.sessionsAtCheckIn },
      })

      // Sin este aviso el check-in se queda en una tabla que nadie abre.
      await checkInRecibido({
        checkIn,
        sesiones: checkIn.sessionsAtCheckIn,
        necesidadLegible: ETIQUETAS_NECESIDAD[checkIn.need] ?? checkIn.need,
      })

      return res
        .status(201)
        .json(
          created(
            { id: checkIn.id },
            'Gracias por decirlo. Coordinación te va a escribir para cuadrar el espacio.',
          ),
        )
    } catch (error) {
      if (error?.codigo) return res.status(409).json(failure(error.message, error.detalles))
      return next(error)
    }
  },
}
