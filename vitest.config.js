import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Las pruebas encolan avisos de verdad, con destinatarios de verdad: las
    // cuentas de administración de la base de desarrollo. Si quedaran ahí, un
    // arranque del servidor con SMTP configurado se los mandaría a gente real.
    // Esto vacía la bandeja al terminar la tanda.
    globalSetup: ['./test/limpiarBandeja.js'],
  },
})
