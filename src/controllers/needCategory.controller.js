import { prisma } from '../config/database.js'
import { ok, created, failure } from '../views/response.view.js'
import { registrar, ACCION } from '../services/audit.service.js'
import { ETIQUETAS_TIPO_NECESIDAD } from '../catalogos.js'

export const NeedCategoryController = {
  /** GET /api/needs-catalog */
  async index(req, res, next) {
    try {
      const { includeInactive } = req.query
      const where = includeInactive === 'true' ? {} : { active: true }

      const items = await prisma.needCategory.findMany({
        where,
        orderBy: [{ type: 'asc' }, { order: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: { leaders: true },
          },
        },
      })

      const formateados = items.map((c) => ({
        id: c.id,
        type: c.type,
        tipoLegible: ETIQUETAS_TIPO_NECESIDAD[c.type] ?? c.type,
        name: c.name,
        description: c.description,
        active: c.active,
        order: c.order,
        leadersCount: c._count.leaders,
        createdAt: c.createdAt,
      }))

      return res.json(ok(formateados))
    } catch (error) {
      return next(error)
    }
  },

  /** POST /api/needs-catalog (Solo ADMIN) */
  async create(req, res, next) {
    try {
      const { type, name, description, active, order } = req.validated

      const item = await prisma.needCategory.create({
        data: {
          type,
          name,
          description: description?.trim() || null,
          active: active ?? true,
          order: order ?? 0,
        },
      })

      await registrar({
        req,
        action: ACCION.CREAR,
        entity: 'categoria_necesidad',
        entityId: item.id,
        after: item,
      })

      return res.status(201).json(created(item, 'Categoría de necesidad agregada al catálogo.'))
    } catch (error) {
      return next(error)
    }
  },

  /** PUT /api/needs-catalog/:id (Solo ADMIN) */
  async update(req, res, next) {
    try {
      const { id } = req.params
      const existing = await prisma.needCategory.findUnique({ where: { id } })
      if (!existing) {
        return res.status(404).json(failure('Categoría no encontrada.'))
      }

      const { type, name, description, active, order } = req.validated
      const item = await prisma.needCategory.update({
        where: { id },
        data: {
          ...(type !== undefined ? { type } : {}),
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(order !== undefined ? { order } : {}),
        },
      })

      await registrar({
        req,
        action: ACCION.EDITAR,
        entity: 'categoria_necesidad',
        entityId: item.id,
        before: existing,
        after: item,
      })

      return res.json(ok(item, 'Categoría de necesidad actualizada.'))
    } catch (error) {
      return next(error)
    }
  },

  /** DELETE /api/needs-catalog/:id (Solo ADMIN) */
  async destroy(req, res, next) {
    try {
      const { id } = req.params
      const existing = await prisma.needCategory.findUnique({
        where: { id },
        include: { _count: { select: { leaders: true } } },
      })
      if (!existing) {
        return res.status(404).json(failure('Categoría no encontrada.'))
      }

      // Si tiene líderes asociados, solo se desactiva para no romper trazabilidad
      if (existing._count.leaders > 0) {
        const item = await prisma.needCategory.update({
          where: { id },
          data: { active: false },
        })

        await registrar({
          req,
          action: ACCION.EDITAR,
          entity: 'categoria_necesidad',
          entityId: item.id,
          before: existing,
          after: item,
        })

        return res.json(ok(item, 'La opción tiene registros históricos y fue desactivada del catálogo.'))
      }

      await prisma.needCategory.delete({ where: { id } })

      await registrar({
        req,
        action: ACCION.ELIMINAR,
        entity: 'categoria_necesidad',
        entityId: id,
        before: existing,
      })

      return res.json(ok({ id }, 'Categoría eliminada del catálogo.'))
    } catch (error) {
      return next(error)
    }
  },
}
