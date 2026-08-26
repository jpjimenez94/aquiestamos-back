import { CollaboratorModel } from '../models/collaborator.model.js'
import { created, ok } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { apoyoRecibido } from '../notifications/eventos.js'
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
        status: 'ACTIVO',
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'colaborador',
        entityId: colaborador.id,
      })

      await apoyoRecibido(colaborador)

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
      const all = req.query.all === 'true' || req.query.todos === 'true' || req.query.perPage === 'all'
      const page = Math.max(1, Number(req.query.page ?? 1))
      const perPage = all ? undefined : Math.min(500, Math.max(1, Number(req.query.perPage ?? 25)))

      const filtros = {
        area: req.query.area || undefined,
        city: req.query.city || undefined,
        modality: req.query.modality || undefined,
        status: req.query.status || undefined,
      }

      const [colaboradores, total, porArea] = await Promise.all([
        CollaboratorModel.findAll({
          ...filtros,
          skip: all ? undefined : (page - 1) * perPage,
          take: all ? undefined : perPage,
        }),
        CollaboratorModel.count(filtros),
        CollaboratorModel.contarPorArea(),
      ])

      // Igual que con las postulaciones: aquí hay datos personales, así que
      // interesa saber quién consulta, no solo quién edita.
      await registrar({
        req,
        action: ACCION.CONSULTAR,
        entity: 'colaborador',
        after: { page, perPage: perPage ?? total, total, ...filtros },
      })

      return res.json(
        ok(collaboratorAdminList(colaboradores), {
          page: all ? 1 : page,
          perPage: all ? total : perPage,
          total,
          porArea: resumenPorArea(porArea),
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/collaborators/:id */
  async show(req, res, next) {
    try {
      const c = await CollaboratorModel.findById(req.params.id)
      if (!c) return res.status(404).json({ success: false, message: 'Colaborador no encontrado.' })
      return res.json(ok(collaboratorAdmin(c)))
    } catch (error) { next(error) }
  },

  /** PATCH /api/collaborators/:id */
  async update(req, res, next) {
    try {
      const c = await CollaboratorModel.findById(req.params.id)
      if (!c) return res.status(404).json({ success: false, message: 'Colaborador no encontrado.' })
      const input = req.validated
      const actualizado = await CollaboratorModel.update(req.params.id, {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.area !== undefined ? { area: input.area } : {}),
        ...(input.discipline !== undefined ? { discipline: input.discipline } : {}),
        ...(input.disciplineOther !== undefined ? { disciplineOther: input.disciplineOther || null } : {}),
        ...(input.yearsExperience !== undefined ? { yearsExperience: input.yearsExperience || null } : {}),
        ...(input.professionalCard !== undefined ? { professionalCard: input.professionalCard || null } : {}),
        ...(input.skills !== undefined ? { skills: input.skills || null } : {}),
        ...(input.modality !== undefined ? { modality: input.modality } : {}),
        ...(input.availableToTravel !== undefined ? { availableToTravel: input.availableToTravel || null } : {}),
        ...(input.availableDays !== undefined ? { availableDays: input.availableDays } : {}),
        ...(input.availableSlots !== undefined ? { availableSlots: input.availableSlots } : {}),
        ...(input.weeklyHours !== undefined ? { weeklyHours: input.weeklyHours } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      await registrar({ req, action: ACCION.EDITAR, entity: 'colaborador', entityId: c.id, after: input })
      return res.json(ok(collaboratorAdmin(actualizado), 'Colaborador actualizado.'))
    } catch (error) { next(error) }
  },

  /** DELETE /api/collaborators/:id */
  async destroy(req, res, next) {
    try {
      const c = await CollaboratorModel.findById(req.params.id)
      if (!c) return res.status(404).json({ success: false, message: 'Colaborador no encontrado.' })
      await CollaboratorModel.softDelete(req.params.id)
      await registrar({ req, action: ACCION.ELIMINAR, entity: 'colaborador', entityId: req.params.id })
      return res.json(ok(null, 'Colaborador eliminado.'))
    } catch (error) { next(error) }
  },
}
