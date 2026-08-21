import { env } from '../config/env.js'

/**
 * Envío por la API HTTPS de Brevo.
 *
 * Existe porque Railway bloquea SMTP saliente en sus planes Free, Trial y
 * Hobby: los puertos 25, 465, 587 y 2525 dan "Connection timeout" y no hay
 * forma de saberlo desde el código, solo se ve el tiempo agotado. La API va
 * por el 443, que es tráfico web normal y nadie bloquea.
 *
 * Es el mismo contrato que el transporte SMTP, así que el despachador no sabe
 * ni le importa cuál de los dos está usando.
 */

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export function hayApiConfigurada() {
  return Boolean(env.brevoApiKey)
}

/**
 * "Red Aquí Estamos <no-responder@x.org>" -> { name, email }
 * Un remitente sin nombre también vale.
 */
export function partirRemitente(cadena) {
  const con = String(cadena).match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (con) return { name: con[1].replace(/^"|"$/g, '') || undefined, email: con[2].trim() }
  return { email: String(cadena).trim() }
}

export async function enviarCorreoApi({ para, nombre, asunto, html, texto }) {
  if (!hayApiConfigurada()) throw new Error('BREVO_API_KEY sin configurar')

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': env.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: partirRemitente(env.smtp.remitente),
      to: [{ email: para, ...(nombre ? { name: nombre } : {}) }],
      subject: asunto,
      htmlContent: html,
      textContent: texto,
    }),
    // Sin esto una API que no responde deja la tanda colgada para siempre.
    signal: AbortSignal.timeout(20_000),
  })

  if (!respuesta.ok) {
    // El cuerpo del error de Brevo dice qué pasó (remitente sin verificar,
    // clave inválida, límite diario); sin él solo se vería un número.
    const detalle = await respuesta.text().catch(() => '')
    throw new Error(`Brevo respondió ${respuesta.status}: ${detalle.slice(0, 300)}`)
  }

  return respuesta.json()
}
