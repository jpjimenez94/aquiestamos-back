#!/usr/bin/env node
/**
 * Comprueba que las credenciales SMTP sirven y, si se le pasa una dirección,
 * manda un correo de prueba.
 *
 *   npm run correo:probar
 *   npm run correo:probar -- alguien@ejemplo.com
 */
import { verificarConexion, enviarCorreo, hayCorreoConfigurado } from '../src/notifications/mailer.js'
import { construir } from '../src/notifications/plantillas.js'
import { env } from '../src/config/env.js'

const destino = process.argv[2]

if (!hayCorreoConfigurado()) {
  console.error('')
  console.error('SMTP sin configurar. Faltan estas variables en backend/.env:')
  console.error('  SMTP_HOST      smtp-relay.brevo.com')
  console.error('  SMTP_PORT      587')
  console.error('  SMTP_USER      el login que da Brevo en SMTP & API')
  console.error('  SMTP_PASSWORD  la clave SMTP generada ahí mismo')
  console.error('  SMTP_FROM      Red Aquí Estamos <no-responder@redaquiestamos.org>')
  console.error('')
  process.exit(1)
}

console.log(`Servidor : ${env.smtp.host}:${env.smtp.port}`)
console.log(`Usuario  : ${env.smtp.usuario}`)
console.log(`Remitente: ${env.smtp.remitente}`)
console.log('')

try {
  await verificarConexion()
  console.log('Conexión y credenciales: correctas.')
} catch (error) {
  console.error('No se pudo conectar:', error.message)
  process.exit(1)
}

if (!destino) {
  console.log('')
  console.log('Para mandar un correo de prueba:')
  console.log('  npm run correo:probar -- tu@correo.com')
  process.exit(0)
}

const { asunto, html, texto } = construir('POSTULACION_RECIBIDA', { nombre: 'prueba' })

try {
  await enviarCorreo({ para: destino, nombre: 'Prueba', asunto: `[prueba] ${asunto}`, html, texto })
  console.log(`Correo de prueba enviado a ${destino}.`)
  console.log('Si no llega en un minuto, revisa la carpeta de correo no deseado.')
} catch (error) {
  console.error('No se pudo enviar:', error.message)
  process.exit(1)
}
