import { PrismaClient } from '@prisma/client'
import { isProduction } from './env.js'

// Singleton de Prisma: en desarrollo `node --watch` reinicia el módulo y
// abriríamos una conexión nueva en cada recarga.
const globalForPrisma = globalThis

export const prisma =
  globalForPrisma.__aquiEstamosPrisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['warn', 'error'],
  })

if (!isProduction) globalForPrisma.__aquiEstamosPrisma = prisma

export async function disconnectDatabase() {
  await prisma.$disconnect()
}
