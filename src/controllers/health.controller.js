import { prisma } from '../config/database.js'
import { ok, failure } from '../views/response.view.js'
import { hayAlmacenamientoConfigurado } from '../almacenamiento/documentos.js'

export const HealthController = {
  async check(req, res) {
    try {
      await prisma.$queryRaw`SELECT 1`
      return res.json(
        ok({
          status: 'ok',
          database: 'up',
          /**
           * Si esto dice false, faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en
           * el entorno y NADIE puede subir ni ver documentos. Está en el
           * health a propósito: pasó en producción y solo se notó cuando un
           * profesional intentó subir su cédula. Es un booleano, no un
           * secreto: no revela ni la URL ni la clave.
           */
          documentos: hayAlmacenamientoConfigurado(),
          timestamp: new Date().toISOString(),
        }),
      )
    } catch {
      return res
        .status(503)
        .json(failure('La base de datos no responde', { database: 'down' }))
    }
  },
}
