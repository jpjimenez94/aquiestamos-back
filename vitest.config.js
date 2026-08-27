import dotenv from 'dotenv'
import { defineConfig } from 'vitest/config'

/**
 * Las pruebas cargan `.env.test` ANTES que `.env`, y dotenv nunca pisa una
 * variable ya definida. Así, aunque `.env` apunte a producción —cosa normal
 * mientras se depura algo en Railway— la tanda de pruebas sigue yendo a la
 * base local. El orden de estas dos líneas es la regla entera.
 */
dotenv.config({ path: '.env.test' })
dotenv.config()

export default defineConfig({
  test: {
    // Las pruebas encolan avisos de verdad, con destinatarios de verdad: las
    // cuentas de administración de la base de desarrollo. Si quedaran ahí, un
    // arranque del servidor con SMTP configurado se los mandaría a gente real.
    // Esto vacía la bandeja al terminar la tanda.
    //
    // Además es donde vive la guarda que aborta la tanda entera si
    // `DATABASE_URL` no es local. Ver `test/limpiarBandeja.js`.
    globalSetup: ['./test/limpiarBandeja.js'],
  },
})
