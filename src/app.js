import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { env, isProduction } from './config/env.js'
import { apiRoutes } from './routes/index.js'
import { notFound } from './middlewares/notFound.js'
import { errorHandler } from './middlewares/errorHandler.js'

export function createApp() {
  const app = express()

  // Railway/Vercel están detrás de proxy: necesario para el rate limit por IP.
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(
    cors({
      origin(origin, callback) {
        // Permite herramientas sin origen (curl, health checks de Railway).
        if (!origin) return callback(null, true)
        if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
          return callback(null, true)
        }
        return callback(new Error(`Origen no permitido por CORS: ${origin}`))
      },
      credentials: false,
    }),
  )
  app.use(express.json({ limit: '100kb' }))
  // En las pruebas el registro de peticiones solo añade ruido.
  if (env.nodeEnv !== 'test') {
    app.use(morgan(isProduction ? 'combined' : 'dev'))
  }

  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Aquí Estamos API',
        description: 'Red de acompañamiento psicológico y atención en crisis',
        docs: '/api/health',
      },
    })
  })

  app.use('/api', apiRoutes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
