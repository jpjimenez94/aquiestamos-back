import { CollaboratorModel } from '../models/collaborator.model.js'
import { created, ok } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import {
  collaboratorReceipt,
  collaboratorAdminList,
  resumenPorArea,
} from '../views/collaborator.view.js'

/**
 * CONTROLADOR: voluntariado de otras disciplinas.
 *
 * Orquesta la petición, pide datos al modelo y deja el formato a la vista.
 * No contiene SQL.
 */
export const CollaboratorController = {
  /** POST /api/collaborators — formulario público "Quiero apoyar". */
  async store(req, res, next) {
    try {
      const input = req.validated

      // A quien solo puede apoyar en remoto no se le pregunta por la vacuna,
      // así que no se guarda ningún dato de salud suyo.
      const soloVirtual = input.modality === 'VIRTUAL'

      const colaborador = await CollaboratorModel.create({
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        city: input.city,

        area: input.area,
        discipline: input.discipline,
        disciplineOther: input.disciplineOther || null,
        yearsExperience: input.yearsExperience ?? null,
        professionalCard: input.professionalCard ?? null,
        skills: input.skills || null,

        modality: input.modality,
        availableToTravel: input.availableToTravel || null,
        availableDays: input.availableDays,
        availableSlots: input.availableSlots,
        weeklyHours: input.weeklyHours,
        yellowFeverVaccine: soloVirtual ? null : (input.yellowFeverVaccine ?? null),

        consentVersion: input.consentVersion,
        dataConsent: input.dataConsent,
        sensitiveDataConsent: soloVirtual ? false : input.sensitiveDataConsent,
        communicationsConsent: input.communicationsConsent,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'colaborador',
        entityId: colaborador.id,
      })

      return res.status(201).json(
        created(
          collaboratorReceipt(colaborador),
          'Gracias por sumarte. Quedaste en el directorio y te escribiremos cuando haya algo en lo que puedas ayudar.',
        ),
      )
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/collaborators — el directorio, desde el portal. */
  async index(req, res, next) {
    try {
      const page = Math.max(1, Number(req.query.page ?? 1))
      const perPage = Math.min(100, Math.max(1, Number(req.query.perPage ?? 25)))

      const filtros = {
        area: req.query.area || undefined,
        city: req.query.city || undefined,
        modality: req.query.modality || undefined,
        status: req.query.status || undefined,
      }

      const [colaboradores, total, porArea] = await Promise.all([
        CollaboratorModel.findAll({ ...filtros, skip: (page - 1) * perPage, take: perPage }),
        CollaboratorModel.count(filtros),
        CollaboratorModel.contarPorArea(),
      ])

      // Igual que con las postulaciones: aquí hay datos personales, así que
      // interesa saber quién consulta, no solo quién edita.
      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'colaborador',
        after: { page, perPage, total, ...filtros },
      })

      return res.json(
        ok(collaboratorAdminList(colaboradores), {
          page,
          perPage,
          total,
          porArea: resumenPorArea(porArea),
        }),
      )
    } catch (error) {
      next(error)
    }
  },
}
