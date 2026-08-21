#!/usr/bin/env node
/**
 * Vacía la bandeja de avisos a mano, sin esperar al despachador.
 * Útil justo después de configurar SMTP: manda lo que quedó encolado antes.
 *
 *   npm run avisos:despachar
 */
import { despachar } from '../src/notifications/despachador.js'
import { NotificationModel } from '../src/models/notification.model.js'
import { hayCorreoConfigurado } from '../src/notifications/mailer.js'
import { prisma } from '../src/config/database.js'

if (!hayCorreoConfigurado()) {
  console.error('SMTP sin configurar. Corre antes: npm run correo:probar')
  process.exit(1)
}

const antes = await NotificationModel.contar({ status: 'PENDIENTE' })
console.log(`${antes} avisos pendientes.`)

let total = { enviados: 0, fallidos: 0 }
let tanda
do {
  tanda = await despachar()
  total.enviados += tanda.enviados
  total.fallidos += tanda.fallidos
} while (tanda.enviados + tanda.fallidos > 0)

console.log(`Enviados: ${total.enviados} · fallidos: ${total.fallidos}`)
console.log(`Quedan pendientes: ${await NotificationModel.contar({ status: 'PENDIENTE' })}`)

await prisma.$disconnect()
