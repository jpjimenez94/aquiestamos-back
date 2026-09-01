import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '../src/config/database.js'
import { SettingsService, DEFAULT_SETTINGS } from '../src/services/settings.service.js'
import { plazosDeLiberacion } from '../src/asignacion/barrido.js'
import { parametrosDeAgenda } from '../src/services/scheduling.service.js'
import { cadaCuantosDias } from '../src/disponibilidad/barrido.js'

/**
 * Que girar una perilla de Parametrización cambie algo.
 *
 * Cuatro de los cinco parámetros numéricos de esa pantalla no los leía nadie.
 * Estaban pintados: duración de la sesión, descanso, vencimiento de propuesta
 * y SLA de prioridad alta se guardaban en la base y ahí se quedaban, mientras
 * el sistema seguía con constantes del código y variables de entorno.
 *
 * Eso es peor que no tener la perilla. Quien la gira se va convencido de que
 * cambió el plazo, y el plazo sigue donde estaba. Uno de ellos ni siquiera
 * coincidía: el panel decía que un caso ALTA se atrasa al día, y el código
 * usaba tres.
 *
 * Es el mismo fallo que ya tuvieron las plantillas, y por eso hay una prueba
 * gemela: `plantillasConectadas`. Conectar algo una vez no basta; lo que
 * sostiene la conexión es que alguien la compruebe.
 */

const CLAVES = [
  'DURACION_CITA_MINUTOS',
  'DESCANSO_CITA_MINUTOS',
  'DIAS_VENCIMIENTO_PROPUESTA',
  'DIAS_VENCIMIENTO_ACEPTADA',
  'SLA_MAXIMO_ALTA_DIAS',
  'ANTELACION_MINIMA_HORAS',
  'CONFIRMAR_DISPONIBILIDAD_DIAS',
]

async function poner(key, valor) {
  await SettingsService.update(key, String(valor), 'pruebas@local')
}

beforeEach(async () => {
  await SettingsService.ensureDefaults()
})

afterAll(async () => {
  /**
   * Devolver cada uno a su valor de fábrica, por el mismo camino por el que
   * se cambiaron.
   *
   * Escribir en la tabla a pelo dejaba el caché en memoria del servicio con
   * los valores de la prueba —«tres», el campo vacío— para todo lo que
   * corriera después. La base quedaba limpia y el proceso no: es la clase de
   * suciedad que sale como un fallo intermitente en OTRO archivo, y ahí ya
   * nadie la relaciona con esto.
   */
  for (const key of CLAVES) {
    const def = DEFAULT_SETTINGS.find((s) => s.key === key)
    if (!def) continue
    await SettingsService.update(key, def.defaultValue, null)
    await prisma.systemSetting.update({ where: { key }, data: { updatedByEmail: null } })
  }
})

describe('los parámetros existen en Parametrización', () => {
  it.each(CLAVES)('%s está declarado', async (key) => {
    const def = DEFAULT_SETTINGS.find((s) => s.key === key)
    expect(def, `${key} no está en DEFAULT_SETTINGS`).toBeDefined()
    expect(def.dataType).toBe('NUMERO')
    expect(def.category).toBe('PARAMETRO_GENERAL')
    // La descripción es lo único que quien coordina tiene para saber qué
    // mueve la perilla. Una vacía es una perilla sin etiqueta.
    expect(def.description.length).toBeGreaterThan(30)
  })
})

describe('y girarlos cambia algo', () => {
  it('el plazo para liberar un caso sale de Parametrización', async () => {
    await poner('DIAS_VENCIMIENTO_ACEPTADA', 9)
    expect((await plazosDeLiberacion()).aceptada).toBe(9)
  })

  it('el de la propuesta antigua también', async () => {
    await poner('DIAS_VENCIMIENTO_PROPUESTA', 7)
    expect((await plazosDeLiberacion()).propuesta).toBe(7)
  })

  it('la antelación mínima para agendar también', async () => {
    await poner('ANTELACION_MINIMA_HORAS', 6)
    expect((await parametrosDeAgenda()).antelacionHoras).toBe(6)
  })

  it('la duración y el descanso de la sesión también', async () => {
    await poner('DURACION_CITA_MINUTOS', 60)
    await poner('DESCANSO_CITA_MINUTOS', 15)
    const p = await parametrosDeAgenda()
    expect(p.duracionMinima).toBe(60)
    expect(p.descanso).toBe(15)
  })

  it('cada cuánto se pregunta al profesional si sigue disponible también', async () => {
    await poner('CONFIRMAR_DISPONIBILIDAD_DIAS', 45)
    expect(await cadaCuantosDias()).toBe(45)
  })
})

describe('un parámetro mal escrito no puede apagar un barrido', () => {
  /**
   * Si alguien escribe «tres» o borra el campo, lo que NO puede pasar es que
   * un NaN entre en una resta de fechas: el plazo se volvería una fecha
   * inválida y el barrido dejaría de liberar casos en silencio, que es la
   * peor forma de fallar — nadie lo nota hasta que hay veinte casos parados.
   */
  it('con texto en el campo, manda el valor de respaldo', async () => {
    await poner('DIAS_VENCIMIENTO_ACEPTADA', 'tres')
    expect((await plazosDeLiberacion()).aceptada).toBe(3)
  })

  it('con el campo vacío, igual', async () => {
    await poner('ANTELACION_MINIMA_HORAS', '')
    expect((await parametrosDeAgenda()).antelacionHoras).toBe(3)
  })

  it('con un negativo, igual', async () => {
    await poner('DURACION_CITA_MINUTOS', '-10')
    expect((await parametrosDeAgenda()).duracionMinima).toBe(45)
  })
})
