import { tieneRol } from '../auth/permissions.js'
import { ProfessionalModel } from '../models/professional.model.js'
import { UserModel } from '../models/user.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { prisma } from '../config/database.js'
import { aprobarPostulacion } from '../services/promotion.service.js'
import { postulacionAprobada, solicitarDocumentosEmail } from '../notifications/eventos.js'
import { cargaActual } from '../services/scheduling.service.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ok, created, failure } from '../views/response.view.js'
import { profesionalLista, profesionalSegunRol } from '../views/professional.view.js'
import { crearEnlaceDocumentos } from '../auth/enlaceDocumentos.js'
import { env } from '../config/env.js'

export const ProfessionalController = {
  /** GET /api/professionals */
  async index(req, res, next) {
    try {
      const profesionales = await ProfessionalModel.findAll({
        status: req.query.status || undefined,
        city: req.query.city || undefined,
        modality: req.query.modality || undefined,
        skip: req.query.skip || undefined,
        take: req.query.take || undefined,
      })

      const carga = await cargaActual(profesionales.map((p) => p.id))
      const sitio = env.sitioUrl.replace(/\/$/, '')
      const lista = profesionalLista(profesionales, req.usuario).map((p) => ({
        ...p,
        carga: carga(p.id),
        // El enlace por el que ÉL sube sus documentos. Solo mientras falte:
        // verificado, no hay nada que pedir.
        enlaceDocumentos: p.professionalCardVerified
          ? null
          : `${sitio}/documentos/${crearEnlaceDocumentos(p.id)}`,
      }))

      return res.json(ok(lista, { total: lista.length }))
    } catch (error) {
      next(error)
    }
  },

  /** GET /api/professionals/:id */
  async show(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      const casos = await CaseAssignmentModel.findDeProfesional(profesional.id)

      return res.json(
        ok({
          ...profesionalSegunRol(profesional, req.usuario),
          enlaceDocumentos: profesional.professionalCardVerified
            ? null
            : `${env.sitioUrl.replace(/\/$/, '')}/documentos/${crearEnlaceDocumentos(profesional.id)}`,
          carga: casos.length,
          casos: casos.map((c) => ({
            id: c.id,
            paciente: { id: c.patient.id, nombre: c.patient.fullName },
            desde: c.startedAt,
          })),
        }),
      )
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/professionals/aprobar/:volunteerId */
  async aprobar(req, res, next) {
    try {
      const { profesional, franjasCreadas } = await aprobarPostulacion({
        volunteerId: req.params.volunteerId,
        ajustes: req.validated,
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'profesional',
        entityId: profesional.id,
        after: { desdePostulacion: req.params.volunteerId, franjasCreadas },
      })

      await postulacionAprobada(profesional)

      return res
        .status(201)
        .json(
          created(
            profesionalSegunRol(profesional, req.usuario),
            franjasCreadas > 0
              ? `Profesional creado con ${franjasCreadas} franjas de disponibilidad.`
              : 'Profesional creado. Falta cargarle franjas de disponibilidad.',
          ),
        )
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/professionals/:id */
  async update(req, res, next) {
    try {
      const anterior = await ProfessionalModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Profesional no encontrado'))

      // Enlazar con una cuenta del portal: es lo que permite que el profesional
      // entre y vea su propia agenda.
      if (req.validated.userId) {
        const cuenta = await UserModel.findById(req.validated.userId)
        if (!cuenta) return res.status(404).json(failure('Esa cuenta no existe'))
        if (!tieneRol(cuenta, 'PROFESIONAL')) {
          return res
            .status(422)
            .json(failure('La cuenta debe tener el rol PROFESIONAL para enlazarla'))
        }

        const yaEnlazada = await ProfessionalModel.findByUserId(req.validated.userId)
        if (yaEnlazada && yaEnlazada.id !== req.params.id) {
          return res
            .status(409)
            .json(failure(`Esa cuenta ya está enlazada con ${yaEnlazada.fullName}`))
        }
      }

      const profesional = await ProfessionalModel.update(req.params.id, req.validated)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'profesional',
        entityId: profesional.id,
        before: profesionalSegunRol(anterior, req.usuario),
        after: profesionalSegunRol(profesional, req.usuario),
      })

      return res.json(ok(profesionalSegunRol(profesional, req.usuario)))
    } catch (error) {
      next(error)
    }
  },

  /** PATCH /api/professionals/:id/tarjeta-profesional */
  async actualizarTarjetaProfesional(req, res, next) {
    try {
      const anterior = await ProfessionalModel.findById(req.params.id)
      if (!anterior) return res.status(404).json(failure('Profesional no encontrado'))

      const { professionalCardNumber, professionalCardDocumentUrl, professionalCardVerified } = req.validated

      const dataToUpdate = {
        ...(professionalCardNumber !== undefined ? { professionalCardNumber } : {}),
        ...(professionalCardDocumentUrl !== undefined ? { professionalCardDocumentUrl } : {}),
        ...(professionalCardVerified !== undefined ? { professionalCardVerified } : {}),
        ...(professionalCardVerified === true
          ? {
              professionalCardVerifiedAt: new Date(),
              professionalCardVerifiedBy: req.usuario?.email ?? req.usuario?.name ?? 'Admin',
            }
          : professionalCardVerified === false
          ? {
              professionalCardVerifiedAt: null,
              professionalCardVerifiedBy: null,
            }
          : {}),
      }

      const profesional = await ProfessionalModel.update(req.params.id, dataToUpdate)

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'profesional_tarjeta',
        entityId: profesional.id,
        before: {
          numero: anterior.professionalCardNumber,
          verificada: anterior.professionalCardVerified,
        },
        after: {
          numero: profesional.professionalCardNumber,
          verificada: profesional.professionalCardVerified,
        },
      })

      return res.json(ok(profesionalSegunRol(profesional, req.usuario), 'Tarjeta profesional actualizada con éxito'))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/professionals/:id/solicitar-documentos-email */
  async solicitarDocumentosEmail(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      if (!profesional.email) {
        return res.status(422).json(failure('El profesional no tiene correo electrónico registrado'))
      }

      const token = crearEnlaceDocumentos(profesional.id)
      await solicitarDocumentosEmail({ profesional, token })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'aviso_documentos',
        entityId: profesional.id,
        after: { destinatario: profesional.email },
      })

      return res.json(
        ok(
          { enviado: true, email: profesional.email },
          `Correo enviado a ${profesional.email} para cargar documentos`,
        ),
      )
    } catch (error) {
      next(error)
    }
  },

  /** DELETE /api/professionals/:id */
  async destroy(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      const activos = await CaseAssignmentModel.contarActivas(profesional.id)
      if (activos > 0) {
        return res
          .status(409)
          .json(
            failure(
              `No se puede dar de baja: todavia acompana a ${activos} persona(s). Cierra esos casos primero.`,
            ),
          )
      }

      await ProfessionalModel.softDelete(profesional.id)
      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'profesional',
        entityId: profesional.id,
        before: profesionalSegunRol(profesional, req.usuario),
      })

      return res.json(ok({ eliminado: true, id: profesional.id }))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/professionals/:id/convertir-colaborador */
  async convertirAColaborador(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      const { area, discipline, disciplineOther, skills } = req.validated

      // Crear el colaborador en el directorio de voluntariado de apoyo
      const colaborador = await prisma.collaborator.create({
        data: {
          fullName: profesional.fullName,
          phone: profesional.phone,
          email: profesional.email,
          city: profesional.city,
          area,
          discipline,
          disciplineOther: disciplineOther ?? null,
          skills: skills ?? profesional.notes ?? null,
          yearsExperience: profesional.yearsExperience ?? null,
          professionalCard: profesional.professionalCard ?? null,
          modality: profesional.modality ?? 'VIRTUAL',
          dataConsent: true,
          communicationsConsent: true,
          status: 'ACTIVO',
        },
      })

      // Dar de baja el registro de profesional
      await ProfessionalModel.softDelete(profesional.id)

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'colaborador_desde_profesional',
        entityId: colaborador.id,
        before: { profesionalId: profesional.id, profesion: profesional.profession },
        after: { colaboradorId: colaborador.id, area, discipline },
      })

      return res.status(201).json(created(colaborador, 'Movido exitosamente al Voluntariado de Apoyo.'))
    } catch (error) {
      next(error)
    }
  },

  /** POST /api/professionals/:id/rechazar */
  async rechazar(req, res, next) {
    try {
      const profesional = await ProfessionalModel.findById(req.params.id)
      if (!profesional) return res.status(404).json(failure('Profesional no encontrado'))

      const { motivo, detalles } = req.validated

      await ProfessionalModel.update(req.params.id, {
        status: 'INACTIVO',
        notes: `[RECHAZADO]: ${motivo}${detalles ? ` — ${detalles}` : ''}`,
      })

      await ProfessionalModel.softDelete(profesional.id)

      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'profesional_rechazado',
        entityId: profesional.id,
        after: { motivo, detalles },
      })

      return res.json(ok({ rechazado: true, id: profesional.id }, 'Postulación rechazada y archivada.'))
    } catch (error) {
      next(error)
    }
  },
}

