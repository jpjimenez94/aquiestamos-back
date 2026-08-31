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
    /**
     * Un archivo de pruebas a la vez.
     *
     * Todas comparten UNA base, y varias miran estado global: `avisos.flow`
     * cuenta lo que hay en la bandeja, `cerrojo` compite por el pool de
     * conexiones, y los avisos de coordinación van a todas las cuentas ADMIN
     * que existan en ese momento. En paralelo, una prueba ve lo que otra acaba
     * de crear y falla sin que nada esté roto.
     *
     * Estuvo oculto mientras hubo pocos archivos. Al añadir varios, empezaron
     * a fallar dos que pasan perfectamente por separado — y una prueba que
     * falla a veces es peor que ninguna: enseña a reintentar hasta que pase, y
     * a partir de ahí ya nadie la mira.
     *
     * La alternativa sería una base por archivo. Cuesta más de lo que vale
     * para una suite que tarda segundos; esto es determinista y se entiende.
     */
    fileParallelism: false,

    /**
     * Quince segundos por prueba, no cinco.
     *
     * Buena parte de la suite habla con una base de datos de verdad, y la
     * PRIMERA consulta contra una recién levantada cuesta unos dos segundos:
     * es Prisma abriendo la conexión, no la consulta. En caliente son cero.
     *
     * Con el plazo por defecto de cinco segundos, una prueba que espera a que
     * salga un correo se quedaba sin margen justo en la primera corrida del
     * día — y una prueba que falla según lo fría que esté la base enseña a
     * relanzarla, no a mirarla.
     *
     * Esperar más no hace nada más lento: cada prueba vuelve en cuanto tiene lo
     * que espera. El plazo solo dice cuándo rendirse.
     */
    testTimeout: 15000,

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
