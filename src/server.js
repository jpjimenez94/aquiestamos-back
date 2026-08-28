import { createApp } from './app.js'
import { env, isProduction } from './config/env.js'
import { disconnectDatabase } from './config/database.js'
import { arrancarDespachador, detenerDespachador } from './notifications/despachador.js'
import { arrancarBarrido, detenerBarrido } from './admision/barrido.js'
import {
  arrancarBarridoAsignaciones,
  detenerBarridoAsignaciones,
} from './asignacion/barrido.js'
import { arrancarBarridoCitas, detenerBarridoCitas } from './citas/barrido.js'
import {
  arrancarBarridoDisponibilidad,
  detenerBarridoDisponibilidad,
} from './disponibilidad/barrido.js'
import { vigilarProceso } from './monitoreo/errores.js'
import { hayAlmacenamientoConfigurado } from './almacenamiento/documentos.js'
import { esBaseLocal, describirBaseParaHumanos } from './config/baseSegura.js'

// Antes de todo: si algo revienta fuera de Express, que alguien se entere.
vigilarProceso()

/**
 * Decir en voz alta contra qué base se está trabajando.
 *
 * Desarrollar contra la base de producción es a veces necesario y no está
 * prohibido. Lo que no puede pasar es hacerlo sin darse cuenta: el `.env` se
 * queda apuntando a Railway después de depurar algo y tres días más tarde
 * alguien corre un script creyendo que está en local.
 *
 * Esto no bloquea nada. Solo hace imposible no verlo.
 */
if (!isProduction && !esBaseLocal(env.databaseUrl)) {
  console.warn('')
  console.warn('  ⚠  ATENCIÓN: esta NO es una base local.')
  console.warn(`     Base: ${describirBaseParaHumanos(env.databaseUrl)}`)
  console.warn('     Cada cambio que hagas aquí le pasa a datos de gente real.')
  console.warn('')
}

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

  // Recordatorios de sesión, pedir el reporte después, y la alarma de una
  // prioridad ALTA que se está quedando en la cola.
  arrancarBarridoCitas()

  // Preguntarle cada mes al profesional si su agenda sigue al día. Es lo que
  // sostiene que se le asigne sin consultarle: la persona elige su hora de esa
  // agenda, y una vieja la manda a una hora en la que él ya no está.
  arrancarBarridoDisponibilidad()

  // Sin Supabase configurado, TODO lo de documentos falla: la subida por
  // enlace, los consentimientos escaneados y las tarjetas. Pasó en
  // producción y el primero en enterarse fue un profesional con su cédula
  // en la mano. Que grite aquí, donde lo ve quien despliega.
  if (!hayAlmacenamientoConfigurado()) {
    console.warn(
      '[documentos] OJO: faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY. ' +
        'Nadie puede subir ni ver documentos hasta ponerlas.',
    )
  }
})

async function shutdown(signal) {
  console.log(`[api] ${signal} recibido, cerrando...`)
  detenerDespachador()
  detenerBarrido()
  detenerBarridoAsignaciones()
  detenerBarridoCitas()
  detenerBarridoDisponibilidad()
  server.close(async () => {
    await disconnectDatabase()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
