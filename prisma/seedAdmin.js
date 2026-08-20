#!/usr/bin/env node
/**
 * Crea la primera cuenta de administrador. Sin ella no hay forma de entrar al
 * portal, porque no existe registro público.
 *
 *   npm run db:seed-admin
 *
 * Toma los datos de BOOTSTRAP_ADMIN_EMAIL / _NAME / _PASSWORD. Si no hay clave
 * en el entorno, genera una aleatoria y la muestra una sola vez.
 *
 * Es idempotente: si la cuenta ya existe, no la toca.
 */

import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashearClave, problemasDeClave } from '../src/auth/password.js'
import { env } from '../src/config/env.js'

const prisma = new PrismaClient()

function claveAleatoria() {
  // 18 bytes en base64url dan 24 caracteres; se añade un dígito para cumplir
  // la regla de «al menos un número» pase lo que pase.
  return randomBytes(18).toString('base64url').replace(/[-_]/g, 'x') + '7'
}

async function main() {
  const email = (env.bootstrapAdminEmail || '').trim().toLowerCase()

  if (!email) {
    console.error(
      '\n[admin] Falta BOOTSTRAP_ADMIN_EMAIL en el entorno.\n' +
        '        Añádelo a backend/.env y vuelve a ejecutar.\n',
    )
    process.exit(1)
  }

  const existente = await prisma.user.findUnique({ where: { email } })
  if (existente) {
    console.log(`[admin] La cuenta ${email} ya existe (${existente.role}). No se toca nada.`)
    return
  }

  const generada = !env.bootstrapAdminPassword
  const clave = env.bootstrapAdminPassword || claveAleatoria()

  const problemas = problemasDeClave(clave)
  if (problemas.length > 0) {
    console.error('\n[admin] La clave de BOOTSTRAP_ADMIN_PASSWORD no es válida:')
    for (const p of problemas) console.error('        · ' + p)
    console.error('')
    process.exit(1)
  }

  const usuario = await prisma.user.create({
    data: {
      email,
      name: env.bootstrapAdminName,
      role: 'ADMIN',
      passwordHash: await hashearClave(clave),
      mustChangePassword: true,
    },
  })

  console.log('\n════════════════════════════════════════════════════')
  console.log('  Cuenta de administrador creada')
  console.log('')
  console.log('  Correo : ' + usuario.email)
  if (generada) {
    console.log('  Clave  : ' + clave)
    console.log('')
    console.log('  Esta clave no se vuelve a mostrar. Guárdala ahora.')
  } else {
    console.log('  Clave  : la de BOOTSTRAP_ADMIN_PASSWORD')
  }
  console.log('')
  console.log('  Hay que cambiarla en el primer inicio de sesión.')
  console.log('════════════════════════════════════════════════════\n')
}

main()
  .catch((error) => {
    console.error('[admin] Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
