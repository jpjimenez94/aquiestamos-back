#!/usr/bin/env node
/**
 * Comprueba que las credenciales SMTP sirven y, si se le pasa una dirección,
 * manda un correo de prueba.
 *
 *   npm run correo:probar
 *   npm run correo:probar -- alguien@ejemplo.com
 */
import {
  verificarConexion,
  enviarCorreo,
  hayCorreoConfigurado,
  transporteEnUso,
} from '../src/notifications/mailer.js'
import { construir } from '../src/notifications/plantillas.js'
import { env } from '../src/config/env.js'

const destino = process.argv[2]

if (!hayCorreoConfigurado()) {
  console.error('')
  console.error('Correo sin configurar. Hace falta una de las dos vías:')
  console.error('')
  console.error('  A) API HTTPS (la que sirve en Railway):')
  console.error('     BREVO_API_KEY  la clave de API, empieza por xkeysib-')
  console.error('     SMTP_FROM      Red Aquí Estamos <no-responder@redaquiestamos.org>')
  console.error('')
  console.error('  B) SMTP (sirve en local; Railway lo bloquea salvo en plan Pro):')
  console.error('     SMTP_HOST      smtp-relay.brevo.com')
  console.error('     SMTP_PORT      587')
  console.error('     SMTP_USER      el login que da Brevo en SMTP y API')
  console.error('     SMTP_PASSWORD  la clave SMTP, empieza por xsmtpsib-')
  console.error('     SMTP_FROM      Red Aquí Estamos <no-responder@redaquiestamos.org>')
  console.error('')
  process.exit(1)
}

console.log(`Transporte: ${transporteEnUso()}`)
console.log(`Remitente : ${env.smtp.remitente}`)
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
