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

    expect(simultaneos).toBe(1)

    // Uno trabajó y el otro se fue con las manos vacías, sin esperar turno.
    // Cuál de los dos ganó depende de la carrera, así que se comprueba el
    // conjunto y no el orden.
    expect([a, b].filter((r) => r === 'hecho')).toHaveLength(1)
    expect([a, b].filter((r) => r === null)).toHaveLength(1)
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
