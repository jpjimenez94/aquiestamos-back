import { prisma } from '../config/database.js'
import { ok, failure } from '../views/response.view.js'

export const HealthController = {
  async check(req, res) {
    try {
      await prisma.$queryRaw`SELECT 1`
      return res.json(ok({ status: 'ok', database: 'up', timestamp: new Date().toISOString() }))
    } catch {
      return res
        .status(503)
        .json(failure('La base de datos no responde', { database: 'down' }))
    }
  },
}
