import { VolunteerModel } from '../models/volunteer.model.js'
import { created, ok } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { postulacionRecibida } from '../notifications/eventos.js'
import { volunteerReceipt, volunteerAdminList } from '../views/volunteer.view.js'
import { aprobarPostulacion } from '../services/promotion.service.js'

/**
 * CONTROLADOR: orquesta la petición HTTP, pide datos al modelo y delega
 * el formato de salida a la vista. No contiene SQL ni HTML.
 */
export const VolunteerController = {
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
      // ACTIVOS. No hay paso de aprobación manual; la verificación de la
      // Tarjeta Profesional se gestiona por separado antes de asignar casos.
      try {
        await aprobarPostulacion({
          volunteerId: volunteer.id,
          ajustes: { status: 'ACTIVO' },
        })
      } catch (errorAprobacion) {
        // Si falla la auto-aprobación (ej. ya existía el profesional),
        // se ignora silenciosamente — el registro de postulación ya quedó.
        console.error('[auto-aprobacion] no se pudo crear el profesional:', errorAprobacion.message)
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
}
