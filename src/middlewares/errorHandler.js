import { Prisma } from '@prisma/client'
import { isProduction } from '../config/env.js'
import { failure } from '../views/response.view.js'
import { DomainError, estadoDe } from '../errors/DomainError.js'
import { capturarError } from '../monitoreo/errores.js'

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // Los errores de negocio traen su propio código y su traducción a HTTP.
  if (error instanceof DomainError) {
    return res
      .status(estadoDe(error.codigo))
      .json(failure(error.message, { codigo: error.codigo, ...(error.detalles ?? {}) }))
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return res.status(409).json(failure('Ese registro ya existe'))
    }
    if (error.code === 'P2025') {
      return res.status(404).json(failure('Registro no encontrado'))
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error('[db] No se pudo conectar a PostgreSQL:', error.message)
    return res.status(503).json(failure('La base de datos no está disponible en este momento'))
  }

  const status = error.status ?? 500

  // Solo los 500 de verdad avisan a coordinación: un 400 de validación es
  // ruido del día a día, no una falla de la plataforma.
  if (status >= 500) {
    capturarError(`${req.method} ${req.originalUrl}`, error)
    import('../models/auditLog.model.js')
      .then(({ AuditLogModel }) => {
        AuditLogModel.create({
          actorEmail: req.usuario?.email || null,
          actorId: req.usuario?.id || null,
          action: 'error_servidor',
          entity: 'sistema',
          entityId: null,
          ip: req.ip || null,
          after: {
            metodo: req.method,
            ruta: req.originalUrl,
            error: error.message,
            stack: error.stack ? error.stack.slice(0, 500) : null,
          },
        }).catch((e) => console.error('[auditoria] error registrando 500:', e.message))
      })
      .catch(() => {})
  } else {
    console.error('[error]', error)
  }
  return res
    .status(status)
    .json(failure(status === 500 ? 'Error interno del servidor' : error.message,
      isProduction ? undefined : { stack: error.stack }))
}
