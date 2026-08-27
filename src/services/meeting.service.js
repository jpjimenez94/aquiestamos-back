import crypto from 'crypto'
import { env } from '../config/env.js'
import { SettingsService } from './settings.service.js'

/**
 * Sala de videollamada: el nombre de la sala y la llave para entrar.
 *
 * Todo lo de aquí se firma con `env.meetingSecret`, obligatorio fuera de las
 * pruebas. Antes se firmaba con `env.jwtSecret || 'aqui-estamos-secret-key'`
 * y `jwtSecret` no existía en la configuración: la firma era siempre ese
 * literal, que está publicado en GitHub. Ver el comentario largo en
 * `config/env.js`.
 */

/** Único sitio del que sale el secreto. Si falta, que reviente aquí y no a medias. */
function secreto() {
  if (!env.meetingSecret) {
    throw new Error('Falta MEETING_SECRET: no se pueden firmar enlaces de sala.')
  }
  return env.meetingSecret
}

/**
 * Dominio de Jitsi.
 *
 * Manda lo que diga Parametrización (`DOMINIO_JITSI`), que es donde la
 * coordinación puede cambiarlo sin tocar código ni redesplegar. La variable de
 * entorno es solo el valor de arranque.
 *
 * Antes esto leía `process.env.JITSI_DOMAIN` directo y el ajuste del portal no
 * hacía nada: se podía cambiar en la pantalla y las salas seguían abriéndose
 * en el dominio viejo, sin ninguna pista de por qué.
 */
async function dominioJitsi() {
  try {
    const configurado = await SettingsService.getValue('DOMINIO_JITSI', '')
    if (configurado && String(configurado).trim()) {
      return String(configurado).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    }
  } catch {
    // Si la base no responde, una sala en el dominio por defecto es mucho
    // mejor que una cita sin enlace.
  }
  return env.jitsiDomain
}

/**
 * Nombre de sala único y difícil de adivinar para una cita.
 *
 * Es determinista: la misma cita da siempre la misma sala, que es lo que
 * permite que la persona y quien la acompaña coincidan sin coordinar nada.
 * En Jitsi el nombre de la sala ES la credencial, así que se deriva del
 * secreto y no del identificador de la cita a secas.
 */
export async function generarEnlaceVideollamada(appointmentId) {
  if (!appointmentId) return null

  const hash = crypto
    .createHmac('sha256', secreto())
    .update(`appointment-room-${appointmentId}`)
    .digest('hex')
    .slice(0, 16)

  const shortId = String(appointmentId).replace(/-/g, '').slice(0, 8)
  return `https://${await dominioJitsi()}/AquiEstamos-${shortId}-${hash}`
}

/**
 * Llave de entrada a la sala de espera, sellada y con el rol dentro.
 * Formato: base64url(payload) + '.' + hmac(payload, secreto)
 *
 * No lleva marca de tiempo a propósito. La llevaba, y eso hacía que el mismo
 * enlace cambiara en cada render: el que se le mandó por WhatsApp a la persona
 * dejaba de coincidir con el que veía la coordinación. El enlace caduca cuando
 * caduca la cita, no por el reloj.
 */
export function generarTokenSala(appointmentId, role = 'PACIENTE') {
  if (!appointmentId) return null

  const payloadStr = Buffer.from(
    JSON.stringify({ aid: appointmentId, rol: String(role).toUpperCase() }),
  ).toString('base64url')

  const firma = crypto.createHmac('sha256', secreto()).update(payloadStr).digest('base64url')
  return `${payloadStr}.${firma}`
}

/**
 * Comprueba una llave de sala.
 *
 * Devuelve `{ aid, rol, esUuidCrudo }` si vale, o `null` si no.
 *
 * El caso `esUuidCrudo` es deuda con fecha de caducidad: los enlaces que ya
 * circulan por WhatsApp son `/sala/<uuid-de-la-cita>`, sin firma ninguna, y
 * cortarlos de golpe deja fuera a quien tiene la cita confirmada. Mientras
 * `SALA_ACEPTA_UUID` siga en `true`, conocer el UUID basta para entrar. En
 * cuanto pasen esas citas, ponerlo en `false`.
 */
export function verificarTokenSala(tokenOrId) {
  if (!tokenOrId || typeof tokenOrId !== 'string') return null

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(tokenOrId)) {
    if (!env.salaAceptaUuid) return null
    return { aid: tokenOrId, rol: null, esUuidCrudo: true }
  }

  const partes = tokenOrId.split('.')
  if (partes.length !== 2) return null

  const [payloadStr, firma] = partes
  const esperada = crypto.createHmac('sha256', secreto()).update(payloadStr).digest('base64url')

  // `timingSafeEqual` exige longitudes iguales. Comparar las longitudes antes
  // no filtra nada útil: la del HMAC es fija y pública.
  if (firma.length !== esperada.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(firma, 'utf8'), Buffer.from(esperada, 'utf8'))) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'))
    if (!payload.aid) return null
    return { aid: payload.aid, rol: payload.rol || 'PACIENTE', esUuidCrudo: false }
  } catch {
    return null
  }
}
