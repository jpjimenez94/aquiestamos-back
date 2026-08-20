#!/usr/bin/env node

import { PrismaClient } from '@prisma/client'
import { hashearClave } from '../src/auth/password.js'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await hashearClave('RedAquiEstamos123*')

  await prisma.user.upsert({
    where: { email: 'agendador@prueba.com' },
    update: {},
    create: {
      email: 'agendador@prueba.com',
      name: 'Agendador de Prueba',
      role: 'AGENDADOR',
      passwordHash,
      mustChangePassword: false,
    },
  })

  await prisma.user.upsert({
    where: { email: 'profesional@prueba.com' },
    update: {},
    create: {
      email: 'profesional@prueba.com',
      name: 'Profesional de Prueba',
      role: 'PROFESIONAL',
      passwordHash,
      mustChangePassword: false,
    },
  })

  console.log('\n════════════════════════════════════════════════════')
  console.log('  Cuentas de prueba creadas exitosamente:')
  console.log('')
  console.log('  Rol Agendador:')
  console.log('  Correo: agendador@prueba.com')
  console.log('  Clave:  RedAquiEstamos123*')
  console.log('')
  console.log('  Rol Profesional:')
  console.log('  Correo: profesional@prueba.com')
  console.log('  Clave:  RedAquiEstamos123*')
  console.log('════════════════════════════════════════════════════\n')
}

main()
  .catch((error) => {
    console.error('[seed-roles] Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
