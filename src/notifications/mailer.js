import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

/**
 * El transporte de correo.
 *
 * Se habla SMTP y no la API del proveedor a propósito: cambiar de Brevo a
 * Resend, a SES o a lo que sea queda en cambiar variables de entorno, no en
 * reescribir código.
 */

let transporte = null

export function hayCorreoConfigurado() {
  return Boolean(env.smtp.host && env.smtp.usuario && env.smtp.clave)
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
  if (!hayCorreoConfigurado()) {
    throw new Error('SMTP sin configurar')
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
  if (!hayCorreoConfigurado()) throw new Error('SMTP sin configurar')
  return obtenerTransporte().verify()
}
