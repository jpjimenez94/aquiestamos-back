import { prisma } from '../config/database.js'
import { ok, created, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ETIQUETAS_ESTADO_LIDER, ETIQUETAS_TIPO_NECESIDAD } from '../catalogos.js'

export const CommunityLeaderController = {
  /** GET /api/leaders/summary */
  async summary(req, res, next) {
    try {
      const [totalLideres, totalBeneficiariosAgg, activos, conAccionPendiente, lideresConNecesidades] = await Promise.all([
        prisma.communityLeader.count({ where: { deletedAt: null } }),
        prisma.communityLeader.aggregate({
          where: { deletedAt: null },
          _sum: { beneficiariesCount: true },
        }),
        prisma.communityLeader.count({ where: { deletedAt: null, status: 'ACTIVO' } }),
        prisma.communityLeader.count({
          where: {
            deletedAt: null,
            nextAction: { not: null },
            status: { in: ['ACTIVO', 'EN_SEGUIMIENTO'] },
          },
        }),
        prisma.communityLeaderNeed.findMany({
          where: { leader: { deletedAt: null } },
          include: { need: true },
        }),
      ])

      const psicologicasLeaders = new Set()
      const recursosLeaders = new Set()

      for (const item of lideresConNecesidades) {
        if (item.need?.type === 'PSICOLOGICA') {
          psicologicasLeaders.add(item.leaderId)
        } else if (item.need?.type === 'RECURSO') {
          recursosLeaders.add(item.leaderId)
        }
      }

      return res.json(
        ok({
          totalLideres,
          activos,
          totalBeneficiarios: totalBeneficiariosAgg._sum.beneficiariesCount || 0,
          conAccionPendiente,
          conNecesidadesPsicologicas: psicologicasLeaders.size,
          conNecesidadesRecursos: recursosLeaders.size,
        }),
      )
    } catch (error) {
      return next(error)
    }
  },

  /** GET /api/leaders */
  async index(req, res, next) {
    try {
      const { search, needType, status, page = '1', limit = '50' } = req.query
      const pagina = Math.max(1, parseInt(page, 10) || 1)
      const tamano = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
      const saltar = (pagina - 1) * tamano

      const where = {
        deletedAt: null,
      }

      if (status && status !== 'TODOS') {
        where.status = status
      }

      if (search && search.trim()) {
        const query = search.trim()
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
          { territory: { contains: query, mode: 'insensitive' } },
          { nextAction: { contains: query, mode: 'insensitive' } },
        ]
      }

      if (needType && needType !== 'TODAS') {
        if (needType === 'PSICOLOGICA' || needType === 'RECURSO') {
          where.needs = {
            some: {
              need: { type: needType },
            },
          }
        } else if (needType === 'AMBAS') {
          where.AND = [
            { needs: { some: { need: { type: 'PSICOLOGICA' } } } },
            { needs: { some: { need: { type: 'RECURSO' } } } },
          ]
        }
      }

      const [total, items] = await Promise.all([
        prisma.communityLeader.count({ where }),
        prisma.communityLeader.findMany({
          where,
          skip: saltar,
          take: tamano,
          orderBy: [
            { status: 'asc' },
            { lastContactAt: 'desc' },
            { createdAt: 'desc' },
          ],
          include: {
            needs: {
              include: { need: true },
            },
            _count: {
              select: { contacts: true },
            },
          },
        }),
      ])

      const formateados = items.map((l) => {
        const tienePsicologicas = l.needs.some((n) => n.need?.type === 'PSICOLOGICA')
        const tieneRecursos = l.needs.some((n) => n.need?.type === 'RECURSO')

        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          email: l.email,
          territory: l.territory,
          beneficiariesCount: l.beneficiariesCount,
          status: l.status,
          estadoLegible: ETIQUETAS_ESTADO_LIDER[l.status] ?? l.status,
          lastContactAt: l.lastContactAt,
          nextAction: l.nextAction,
          nextActionDate: l.nextActionDate,
          notes: l.notes,
          tienePsicologicas,
          tieneRecursos,
          needs: l.needs.map((n) => ({
            id: n.needId,
            name: n.need?.name,
            type: n.need?.type,
            tipoLegible: ETIQUETAS_TIPO_NECESIDAD[n.need?.type] ?? n.need?.type,
            details: n.details,
            status: n.status,
          })),
          totalContactos: l._count.contacts,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        }
      })

      return res.json({
        success: true,
        data: formateados,
        meta: {
          total,
          pagina,
          limite: tamano,
          totalPaginas: Math.ceil(total / tamano),
        },
      })
    } catch (error) {
      return next(error)
    }
  },

  /** GET /api/leaders/:id */
  async show(req, res, next) {
    try {
      const { id } = req.params
      const leader = await prisma.communityLeader.findFirst({
        where: { id, deletedAt: null },
        include: {
          needs: {
            include: { need: true },
          },
          contacts: {
            orderBy: { contactedAt: 'desc' },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      if (!leader) {
        return res.status(404).json(failure('Líder comunitario no encontrado.'))
      }

      const tienePsicologicas = leader.needs.some((n) => n.need?.type === 'PSICOLOGICA')
      const tieneRecursos = leader.needs.some((n) => n.need?.type === 'RECURSO')

      const response = {
        id: leader.id,
        name: leader.name,
        phone: leader.phone,
        email: leader.email,
        territory: leader.territory,
        beneficiariesCount: leader.beneficiariesCount,
        status: leader.status,
        estadoLegible: ETIQUETAS_ESTADO_LIDER[leader.status] ?? leader.status,
        lastContactAt: leader.lastContactAt,
        nextAction: leader.nextAction,
        nextActionDate: leader.nextActionDate,
        notes: leader.notes,
        tienePsicologicas,
        tieneRecursos,
        needs: leader.needs.map((n) => ({
          id: n.needId,
          name: n.need?.name,
          type: n.need?.type,
          tipoLegible: ETIQUETAS_TIPO_NECESIDAD[n.need?.type] ?? n.need?.type,
          details: n.details,
          status: n.status,
        })),
        contacts: leader.contacts.map((c) => ({
          id: c.id,
          contactedAt: c.contactedAt,
          contactedBy: c.contactedBy,
          notes: c.notes,
          nextActionDefined: c.nextActionDefined,
          createdAt: c.createdAt,
        })),
        createdBy: leader.createdBy,
        createdAt: leader.createdAt,
        updatedAt: leader.updatedAt,
      }

      return res.json(ok(response))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/leaders */
  async create(req, res, next) {
    try {
      const {
        name,
        phone,
        email,
        territory,
        beneficiariesCount,
        status,
        nextAction,
        nextActionDate,
        notes,
        needIds,
      } = req.validated

      const leader = await prisma.$transaction(async (tx) => {
        const nuevo = await tx.communityLeader.create({
          data: {
            name,
            phone,
            email: email?.trim() || null,
            territory,
            beneficiariesCount: beneficiariesCount ?? 0,
            status: status || 'ACTIVO',
            nextAction: nextAction?.trim() || null,
            nextActionDate: nextActionDate ? new Date(nextActionDate) : null,
            notes: notes?.trim() || null,
            lastContactAt: new Date(),
            createdById: req.usuario?.id ?? null,
          },
        })

        if (needIds && needIds.length > 0) {
          await tx.communityLeaderNeed.createMany({
            data: needIds.map((needId) => ({
              leaderId: nuevo.id,
              needId,
            })),
          })
        }

        // Crear primer registro en bitácora
        await tx.communityLeaderContact.create({
          data: {
            leaderId: nuevo.id,
            contactedBy: req.usuario?.name || req.usuario?.email || 'Coordinación',
            notes: 'Registro inicial del líder y caracterización de la comunidad.',
            nextActionDefined: nextAction?.trim() || null,
          },
        })

        return nuevo
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'lider_comunitario',
        entityId: leader.id,
        after: leader,
      })

      return res.status(201).json(created(leader, 'Líder comunitario registrado exitosamente.'))
    } catch (error) {
      return next(error)
    }
  },

  /** PUT /api/leaders/:id */
  async update(req, res, next) {
    try {
      const { id } = req.params
      const existing = await prisma.communityLeader.findUnique({
        where: { id },
        include: { needs: true },
      })
      if (!existing || existing.deletedAt) {
        return res.status(404).json(failure('Líder comunitario no encontrado.'))
      }

      const {
        name,
        phone,
        email,
        territory,
        beneficiariesCount,
        status,
        nextAction,
        nextActionDate,
        notes,
        needIds,
      } = req.validated

      const updated = await prisma.$transaction(async (tx) => {
        const liderActualizado = await tx.communityLeader.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(phone !== undefined ? { phone } : {}),
            ...(email !== undefined ? { email: email?.trim() || null } : {}),
            ...(territory !== undefined ? { territory } : {}),
            ...(beneficiariesCount !== undefined ? { beneficiariesCount } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(nextAction !== undefined ? { nextAction: nextAction?.trim() || null } : {}),
            ...(nextActionDate !== undefined
              ? { nextActionDate: nextActionDate ? new Date(nextActionDate) : null }
              : {}),
            ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
          },
        })

        if (needIds !== undefined) {
          // Reemplazar necesidades
          await tx.communityLeaderNeed.deleteMany({ where: { leaderId: id } })
          if (needIds.length > 0) {
            await tx.communityLeaderNeed.createMany({
              data: needIds.map((needId) => ({
                leaderId: id,
                needId,
              })),
            })
          }
        }

        return liderActualizado
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'lider_comunitario',
        entityId: updated.id,
        before: existing,
        after: updated,
      })

      return res.json(ok(updated, 'Perfil del líder comunitario actualizado.'))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/leaders/:id/contacts */
  async addContact(req, res, next) {
    try {
      const { id } = req.params
      const existing = await prisma.communityLeader.findUnique({ where: { id } })
      if (!existing || existing.deletedAt) {
        return res.status(404).json(failure('Líder comunitario no encontrado.'))
      }

      const { notes, nextActionDefined, nextActionDate, status } = req.validated

      const contact = await prisma.$transaction(async (tx) => {
        const contactoCreado = await tx.communityLeaderContact.create({
          data: {
            leaderId: id,
            contactedBy: req.usuario?.name || req.usuario?.email || 'Coordinación',
            notes,
            nextActionDefined: nextActionDefined?.trim() || null,
          },
        })

        await tx.communityLeader.update({
          where: { id },
          data: {
            lastContactAt: new Date(),
            ...(nextActionDefined !== undefined
              ? { nextAction: nextActionDefined?.trim() || null }
              : {}),
            ...(nextActionDate !== undefined
              ? { nextActionDate: nextActionDate ? new Date(nextActionDate) : null }
              : {}),
            ...(status !== undefined ? { status } : {}),
          },
        })

        return contactoCreado
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'bitacora_lider',
        entityId: contact.id,
        after: contact,
      })

      return res.status(201).json(created(contact, 'Contacto registrado en la bitácora.'))
    } catch (error) {
      return next(error)
    }
  },

  /** DELETE /api/leaders/:id */
  async destroy(req, res, next) {
    try {
      const { id } = req.params
      const existing = await prisma.communityLeader.findUnique({ where: { id } })
      if (!existing || existing.deletedAt) {
        return res.status(404).json(failure('Líder comunitario no encontrado.'))
      }

      const updated = await prisma.communityLeader.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'INACTIVO',
        },
      })

      await registrar({
        req,
        action: ACCION.BORRAR,
        entity: 'lider_comunitario',
        entityId: id,
        before: existing,
        after: updated,
      })

      return res.json(ok({ id }, 'Líder comunitario eliminado correctamente.'))
    } catch (error) {
      return next(error)
    }
  },
}
