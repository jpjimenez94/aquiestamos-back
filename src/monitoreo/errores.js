import { createHash } from 'node:crypto'
import { NotificationModel } from '../models/notification.model.js'
import { UserModel } from '../models/user.model.js'
import { construir } from '../notifications/plantillas.js'
import { env } from '../config/env.js'

/**
 * Cuando algo falla en producción, alguien se entera.
 *
 * Sin servicio externo a propósito: el aviso viaja por el mismo despachador
 * de correos que ya existe, a coordinación. La dedupeKey lleva un hash del
 * error y el día: el mismo error repetido mil veces en una noche es UN correo
 * hoy, no mil — y mañana, si sigue, otro.
 *
 * Regla de oro: capturar un error nunca puede tumbar nada. Si hasta el aviso
 * falla (por ejemplo, porque lo que está caído es la base), queda la consola
 * y ya — que es exactamente donde estábamos antes.
 */

function hashDe(texto) {
  return createHash('sha256').update(String(texto)).digest('hex').slice(0, 12)
}

async function correosDeCoordinacion() {
  if (env.smtp.coordinacion.length > 0) {
    return env.smtp.coordinacion
  }
  try {
    const admins = await UserModel.findAll?.({ role: 'ADMIN' })
    return (admins ?? []).filter((u) => u.active && !u.deletedAt).map((u) => u.email)
  } catch {
    return []
  }
}

export async function capturarError(origen, error) {
  const mensaje = String(error?.message ?? error ?? 'error sin mensaje').slice(0, 300)
  // La primera línea del stack ubica el archivo; el resto no viaja por correo.
  const donde = String(error?.stack ?? '')
    .split('\n')[1]
    ?.trim()
    ?.slice(0, 200)

  console.error(`[monitoreo] ${origen}:`, error)

  try {
    const dia = new Date().toISOString().slice(0, 10)
    const clave = `error:${hashDe(`${origen}:${mensaje}`)}:${dia}`
    const payload = { origen, mensaje, donde: donde ?? null }
    const { asunto } = construir('COORD_ERROR', payload)

    for (const correo of await correosDeCoordinacion()) {
      await NotificationModel.encolar({
        template: 'COORD_ERROR',
        toEmail: correo,
        toName: null,
        subject: asunto,
        payload,
        entity: 'error',
        entityId: null,
        dedupeKey: `${clave}:${correo}`,
      })
    }
  } catch (fallo) {
    console.error('[monitoreo] no se pudo avisar del error:', fallo.message)
  }
}

/** Los errores que no pasan por Express: promesas sueltas y excepciones. */
export function vigilarProceso() {
  process.on('unhandledRejection', (razon) => {
    capturarError('promesa sin capturar', razon)
  })
  process.on('uncaughtException', (error) => {
    // Se avisa y se deja morir: seguir con estado corrupto es peor, y
    // Railway reinicia el proceso solo.
    capturarError('excepción sin capturar', error).finally(() => process.exit(1))
  })
}
