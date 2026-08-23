import { createApp } from './app.js'
import { env } from './config/env.js'
import { disconnectDatabase } from './config/database.js'
import { arrancarDespachador, detenerDespachador } from './notifications/despachador.js'
import { arrancarBarrido, detenerBarrido } from './admision/barrido.js'
import {
  arrancarBarridoAsignaciones,
  detenerBarridoAsignaciones,
} from './asignacion/barrido.js'

const app = createApp()

const server = app.listen(env.port, () => {
  console.log(`[api] Aquí Estamos escuchando en http://localhost:${env.port} (${env.nodeEnv})`)

  // Los avisos se envían aparte de las peticiones. Si no hay SMTP
  // configurado, esto avisa y no arranca: los avisos se siguen encolando.
  arrancarDespachador()

  // Recoge a quien pidió ayuda y nunca respondió el tamizaje. Sin esto, esa
  // persona no entra a ninguna cola y nadie se entera.
  arrancarBarrido()

  // Libera las asignaciones que se murieron de silencio: el profesional que
  // no respondió, la persona que no confirmó horario. El caso vuelve a la
  // cola y el cupo del profesional queda libre.
  arrancarBarridoAsignaciones()
})

async function shutdown(signal) {
  console.log(`[api] ${signal} recibido, cerrando...`)
  detenerDespachador()
  detenerBarrido()
  detenerBarridoAsignaciones()
  server.close(async () => {
    await disconnectDatabase()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
