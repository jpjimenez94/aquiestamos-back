import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { enviarCorreoApi, hayApiConfigurada } from './mailerApi.js'

/**
 * El transporte de correo. Hay dos y se elige solo:
 *
 *   · API HTTPS de Brevo, si hay BREVO_API_KEY. Es lo que hay que usar en
 *     Railway, porque sus planes Free, Trial y Hobby bloquean el SMTP
 *     saliente: los envíos mueren por tiempo agotado sin decir por qué.
 *   · SMTP con nodemailer, si no. Sirve en local y en cualquier sitio que no
 *     bloquee el puerto, y funciona con cualquier proveedor.
 *
 * La API se prefiere cuando está disponible porque funciona en los dos sitios;
 * SMTP solo en uno.
 */

let transporte = null

export function hayCorreoConfigurado() {
  return hayApiConfigurada() || haySmtpConfigurado()
}

function haySmtpConfigurado() {
  return Boolean(env.smtp.host && env.smtp.usuario && env.smtp.clave)
}

/** Cuál se está usando. Sale en el log al arrancar, para no adivinar. */
export function transporteEnUso() {
  if (hayApiConfigurada()) return 'API HTTPS de Brevo'
  if (haySmtpConfigurado()) return `SMTP ${env.smtp.host}:${env.smtp.port}`
  return 'ninguno'
}

function obtenerTransporte() {
  if (transporte) return transporte

  transporte = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    // 465 va cifrado desde el saludo; 587 empieza en claro y sube con
    // STARTTLS. Es la convención de todos los proveedores.
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.usuario, pass: env.smtp.clave },
  })

  return transporte
}

export async function enviarCorreo({ para, nombre, asunto, html, texto }) {
  if (hayApiConfigurada()) {
    return enviarCorreoApi({ para, nombre, asunto, html, texto })
  }

  if (!haySmtpConfigurado()) {
    throw new Error('Correo sin configurar')
  }

  return obtenerTransporte().sendMail({
    from: env.smtp.remitente,
    to: nombre ? `"${nombre.replace(/"/g, '')}" <${para}>` : para,
    subject: asunto,
    text: texto,
    html,
  })
}

/** Comprueba credenciales sin enviar nada. Lo usa `npm run correo:probar`. */
export async function verificarConexion() {
  // La API no tiene un "verify": se comprueba pidiendo la cuenta, que no
  // envía nada y falla claro si la clave no sirve.
  if (hayApiConfigurada()) {
    const r = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': env.brevoApiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) throw new Error(`Brevo respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return true
  }

  if (!haySmtpConfigurado()) throw new Error('Correo sin configurar')
  return obtenerTransporte().verify()
}
