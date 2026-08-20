import { createApp } from './app.js'
import { env } from './config/env.js'
import { disconnectDatabase } from './config/database.js'

const app = createApp()

const server = app.listen(env.port, () => {
  console.log(`[api] Aquí Estamos escuchando en http://localhost:${env.port} (${env.nodeEnv})`)
})

async function shutdown(signal) {
  console.log(`[api] ${signal} recibido, cerrando...`)
  server.close(async () => {
    await disconnectDatabase()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
