import { PrismaClient } from '@prisma/client'
import { exigirBaseLocal, describirBaseParaHumanos } from '../src/config/baseSegura.js'

/**
 * Deja la bandeja de avisos vacía antes y después de la tanda de pruebas.
 *
 * Las pruebas crean postulaciones, admiten personas y agendan citas, y cada
 * una de esas cosas encola un aviso. Los avisos internos van a las cuentas de
 * administración que existan en la base, que en desarrollo son direcciones
 * reales. Dejarlos encolados significa que el siguiente arranque del servidor
 * con SMTP configurado se los manda a gente que no pidió nada.
 *
 * Este archivo es el `globalSetup` de vitest, así que es lo PRIMERO que corre
 * en toda la tanda. Por eso la guarda de base local vive aquí: si `setup()`
 * lanza, vitest aborta antes de ejecutar una sola prueba. Es el único punto
 * del que ninguna prueba se puede escapar.
 *
 * `vitest.config.js` ya cargó `.env.test` antes que `.env`, que es lo que
 * mantiene la tanda apuntando a la base local aunque `.env` mire a producción.
 */
export async function setup() {
  exigirBaseLocal('vaciar la bandeja de avisos antes de las pruebas')
  console.log(`[pruebas] base: ${describirBaseParaHumanos(process.env.DATABASE_URL)}`)
  await vaciar()
}

export async function teardown() {
  // Se comprueba otra vez: entre `setup` y `teardown` corre todo el código de
  // las pruebas, y cualquiera pudo reasignar `process.env.DATABASE_URL`.
  exigirBaseLocal('vaciar la bandeja de avisos al terminar las pruebas')
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
