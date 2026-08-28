import { describe, it, expect } from 'vitest'
import { conCerrojo, CERROJOS } from '../src/config/cerrojo.js'

/**
 * El cerrojo entre instancias.
 *
 * Lo que se afirma aquí es la propiedad que importa: si dos trabajos piden el
 * mismo turno a la vez, solo uno lo hace. Sin esto, el día que Railway pase de
 * una réplica a dos, cada correo pendiente sale duplicado y cada recordatorio
 * le llega dos veces a alguien que está esperando su sesión.
 *
 * Estas pruebas hablan con Postgres de verdad, que es donde vive el cerrojo.
 * Simular la base aquí sería probar el simulacro.
 */
describe('el cerrojo de los trabajos de fondo', () => {
  it('deja pasar a uno solo cuando dos piden el mismo turno a la vez', async () => {
    let dentro = 0
    let simultaneos = 0

    // Un trabajo que tarda: si el cerrojo no excluyera, los dos coincidirían
    // aquí dentro y `simultaneos` acabaría en 2.
    const trabajo = async () => {
      dentro += 1
      simultaneos = Math.max(simultaneos, dentro)
      await new Promise((r) => setTimeout(r, 150))
      dentro -= 1
      return 'hecho'
    }

    const [a, b] = await Promise.all([
      conCerrojo(CERROJOS.AVISOS, trabajo),
      conCerrojo(CERROJOS.AVISOS, trabajo),
    ])

    /**
     * La propiedad es esta y solo esta: nunca dos dentro a la vez.
     *
     * Aquí se comprobaba además que solo uno devolviera 'hecho', dando por
     * hecho que el perdedor se iría con las manos vacías. Eso resultó
     * intermitente, y la causa no era el cerrojo: era la suposición.
     *
     * Si el pool solo tiene una conexión libre, las dos llamadas no compiten
     * —se ejecutan en serie—. La primera toma el cerrojo, trabaja y lo suelta
     * al hacer commit; la segunda lo encuentra libre y también trabaja. Los dos
     * devuelven 'hecho' y no se ha violado nada: en ningún momento hubo dos
     * dentro. Eso es exclusión funcionando, no fallando.
     *
     * `dentro` lo distingue de verdad: si se hubieran solapado, habría llegado
     * a 2 y la primera línea de abajo lo diría. Se comprueba el rango y no un
     * valor exacto porque cuántos entran depende del pool, que es del entorno;
     * cuántos coinciden depende del cerrojo, que es lo que se prueba.
     *
     * Un test intermitente es peor que ninguno: enseña a reintentar hasta que
     * pase, y entonces deja de mirarse. Este lo era por afirmar de más.
     */
    expect(simultaneos).toBeLessThanOrEqual(1)
    expect(simultaneos).toBe(1)
  })

  it('turnos distintos no se estorban', async () => {
    // Si todos los barridos compartieran número, el de citas bloquearía al de
    // admisión sin ninguna razón.
    const [a, b] = await Promise.all([
      conCerrojo(CERROJOS.ADMISION, async () => 'admision'),
      conCerrojo(CERROJOS.CITAS, async () => 'citas'),
    ])

    expect(a).toBe('admision')
    expect(b).toBe('citas')
  })

  it('suelta el turno al terminar, incluso si el trabajo revienta', async () => {
    await expect(
      conCerrojo(CERROJOS.ASIGNACIONES, async () => {
        throw new Error('la tanda falló')
      }),
    ).rejects.toThrow('la tanda falló')

    // Si el fallo hubiera dejado el cerrojo tomado, esto devolvería null y el
    // barrido quedaría mudo para siempre hasta reiniciar el servidor.
    const despues = await conCerrojo(CERROJOS.ASIGNACIONES, async () => 'libre')
    expect(despues).toBe('libre')
  })

  it('cada trabajo tiene su propio número', () => {
    const numeros = Object.values(CERROJOS)
    expect(new Set(numeros).size).toBe(numeros.length)
  })
})
