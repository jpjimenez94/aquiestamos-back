import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

/**
 * Deja la bandeja de avisos vacía antes y después de la tanda de pruebas.
 *
 * Las pruebas crean postulaciones, admiten personas y agendan citas, y cada
 * una de esas cosas encola un aviso. Los avisos internos van a las cuentas de
 * administración que existan en la base, que en desarrollo son direcciones
 * reales. Dejarlos encolados significa que el siguiente arranque del servidor
 * con SMTP configurado se los manda a gente que no pidió nada.
 */
export async function setup() {
  await vaciar()
}

export async function teardown() {
  await vaciar()
}

async function vaciar() {
  const prisma = new PrismaClient()
  try {
    const { count } = await prisma.notification.deleteMany({})
    if (count > 0) console.log(`[pruebas] bandeja de avisos vaciada (${count})`)
  } catch (error) {
    console.error('[pruebas] no se pudo vaciar la bandeja:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}
