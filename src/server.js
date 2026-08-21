import { createApp } from './app.js'
import { env } from './config/env.js'
import { disconnectDatabase } from './config/database.js'
import { arrancarDespachador, detenerDespachador } from './notifications/despachador.js'

const app = createApp()

const server = app.listen(env.port, () => {
  console.log(`[api] Aquí Estamos escuchando en http://localhost:${env.port} (${env.nodeEnv})`)

  // Los avisos se envían aparte de las peticiones. Si no hay SMTP
  // configurado, esto avisa y no arranca: los avisos se siguen encolando.
  arrancarDespachador()
})

async function shutdown(signal) {
  console.log(`[api] ${signal} recibido, cerrando...`)
  detenerDespachador()
  server.close(async () => {
    await disconnectDatabase()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
