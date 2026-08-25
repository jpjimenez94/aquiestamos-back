import { VolunteerModel } from '../models/volunteer.model.js'
import { created, ok, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { postulacionRecibida, documentosRecibidos } from '../notifications/eventos.js'
import { volunteerReceipt, volunteerAdminList } from '../views/volunteer.view.js'
import { aprobarPostulacion } from '../services/promotion.service.js'
import {
  guardarDocumento,
  hayAlmacenamientoConfigurado,
  esClaveDeAlmacenamiento,
} from '../almacenamiento/documentos.js'
import { capturarError } from '../monitoreo/errores.js'

/**
 * CONTROLADOR: orquesta la petición HTTP, pide datos al modelo y delega
 * el formato de salida a la vista. No contiene SQL ni HTML.
 */
export const VolunteerController = {
  /**
   * POST /api/volunteers/upload — subida opcional de archivos de tarjeta/cédula
   * durante el diligenciamiento del formulario de postulación.
   */
  async subirArchivo(req, res, next) {
    try {
      if (!hayAlmacenamientoConfigurado()) {
        capturarError(
          'almacenamiento sin configurar (subida voluntariado)',
          new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno'),
        )
        return res
          .status(503)
          .json(
            failure(
              'No es tu archivo: tenemos un problema técnico de nuestro lado. Ya avisamos al equipo; puedes enviar el formulario sin adjuntos y te los solicitaremos luego.',
            ),
          )
      }

      const tipo = String(req.get('x-tipo-archivo') ?? req.get('content-type') ?? '')
        .split(';')[0]
        .trim()

      const { clave, tamano } = await guardarDocumento({
        carpeta: 'tarjetas',
        tipo,
        bytes: req.body,
      })

      return res.json(ok({ clave }))
    } catch (error) {
      return next(error)
    }
  },

  async store(req, res, next) {
    try {
      const input = req.validated

      // A quien solo puede acompanar de forma virtual no se le pregunta por la
      // vacuna, asi que no se guarda ningun dato de salud suyo.
      const soloVirtual = input.modality === 'VIRTUAL'

      const volunteer = await VolunteerModel.create({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        city: input.city,

        profession: input.profession,
        additionalTraining: input.additionalTraining || null,
        yearsExperience: input.yearsExperience,
        professionalCard: input.professionalCard,
        populations: input.populations,
        populationOther: input.populationOther || null,
        crisisExperience: input.crisisExperience,

        modality: input.modality,
        availableToTravel: input.availableToTravel || null,
        availableDays: input.availableDays,
        availableSlots: input.availableSlots,
        weeklyHours: input.weeklyHours,
        yellowFeverVaccine: soloVirtual ? null : input.yellowFeverVaccine,

        consentVersion: input.consentVersion,
        dataConsent: input.dataConsent,
        sensitiveDataConsent: soloVirtual ? false : input.sensitiveDataConsent,
        communicationsConsent: input.communicationsConsent,
      })

      // Auto-aprobación: los psicólogos voluntarios entran directamente como
      // ACTIVOS. Si adjuntaron sus documentos (tarjeta y cédula), quedan
      // inmediatamente en «Pendientes de aprobación» con documentsSubmittedAt.
      if (process.env.NODE_ENV !== 'test') {
        try {
          const resultado = await aprobarPostulacion({
            volunteerId: volunteer.id,
            ajustes: {
              status: 'ACTIVO',
              professionalCardNumber: input.professionalCardNumber || null,
              professionalCardDocumentUrl: input.professionalCardDocumentUrl || null,
              identityDocumentUrl: input.identityDocumentUrl || null,
              identityDocumentBackUrl: input.identityDocumentBackUrl || null,
            },
          })

          // Si adjuntó documentos en el formulario, avisar a coordinación
          if (
            input.professionalCardDocumentUrl &&
            input.identityDocumentUrl &&
            resultado?.profesional
          ) {
            await documentosRecibidos({ profesional: resultado.profesional }).catch(() => {})
          }
        } catch (errorAprobacion) {
          // Si falla la auto-aprobación (ej. ya existía el profesional),
          // se ignora silenciosamente — el registro de postulación ya quedó.
          console.error('[auto-aprobacion] no se pudo crear el profesional:', errorAprobacion.message)
        }
      }

      // Encolar el aviso no puede hacer fallar el registro.
      await postulacionRecibida(volunteer)

      return res
        .status(201)
        .json(
          created(
            volunteerReceipt(volunteer),
            'Gracias por sumarte. Registramos tus datos y te contactaremos pronto.',
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

      const [volunteers, total] = await Promise.all([
        VolunteerModel.findAll({
          skip: all ? undefined : (page - 1) * perPage,
          take: all ? undefined : perPage,
          status,
        }),
        VolunteerModel.count({ status }),
      ])

      // Con datos de salud interesa saber también quién CONSULTA, no solo
      // quién edita. Se guarda el hecho y el filtro, nunca el contenido.
      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'postulacion',
        after: { page, perPage: perPage ?? total, total, status: status ?? 'todos' },
      })

      return res.json(
        ok(volunteerAdminList(volunteers), { page: all ? 1 : page, perPage: all ? total : perPage, total }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** DELETE /api/volunteers/:id — borrado lógico de una postulación (ADMIN) */
  async destroy(req, res, next) {
    try {
      const { id } = req.params
      const postulacion = await VolunteerModel.findById(id)
      if (!postulacion) {
        return res.status(404).json(failure('La postulación no existe o ya fue eliminada'))
      }

      await VolunteerModel.softDelete(id)

      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'postulacion',
        entityId: id,
        before: { fullName: postulacion.fullName, email: postulacion.email, status: postulacion.status },
      })

      return res.json(ok(null, 'La postulación fue eliminada correctamente.'))
    } catch (error) {
      next(error)
    }
  },
}
