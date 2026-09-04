import { conCerrojo, CERROJOS } from '../config/cerrojo.js'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { describirFranjas } from '../services/scheduling.service.js'
import { pedirConfirmacionDeDisponibilidad } from '../notifications/eventos.js'
import { enPalabras } from '../services/timezone.service.js'
import { SettingsService } from '../services/settings.service.js'

/**
 * El que pregunta cada tanto si la agenda sigue siendo verdad.
 *
 * Es la condición que hace justo asignar sin preguntar. Cuando se quitó el paso
 * de pedirle permiso al profesional, se escribió que eso solo era legítimo con
 * tres cosas: que declinar siguiera siendo un toque, que solo se asignara a
 * quien tiene cupo, y que su agenda estuviera cargada. Las dos primeras se
 * cumplían. La tercera se cumplía el día que se registró — y nada volvía a
 * mirarla.
 *
 * Una agenda de hace ocho meses, de antes de que cambiara de trabajo, no es un
 * dato viejo: es una persona que pidió ayuda esperando a una hora en la que él
 * no está. Y el sistema no tiene forma de enterarse, porque la ausencia de
 * queja se parece mucho a que todo va bien.
 *
 * No hay castigo por no responder. A quien no contesta se le vuelve a preguntar
 * al mes siguiente y sigue recibiendo casos: dejar de asignarle por un correo
 * sin responder castigaría a quien está disponible pero no mira el correo, que
 * es media red. Lo que esto compra es que quien SÍ cambió tenga un momento
 * natural para decirlo.
 */

/**
 * Cada cuántos días se le vuelve a preguntar.
 *
 * Un mes es el equilibrio: lo bastante seguido para que la agenda no envejezca
 * medio año, lo bastante espaciado para no volverse ruido que se archiva sin
 * leer. Un voluntario al que se le escribe cada semana deja de leer los correos
 * de la red, y entonces se pierde también el que importa.
 */
export const CONFIRMAR_CADA_DIAS = Number(process.env.CONFIRMAR_DISPONIBILIDAD_DIAS ?? 30)

/** Cada cuánto se pregunta, según Parametrización. El valor de aquí es la red. */
export async function cadaCuantosDias() {
  return SettingsService.getNumero('CONFIRMAR_DISPONIBILIDAD_DIAS', CONFIRMAR_CADA_DIAS)
}

/** Cada cuánto se mira. Los umbrales son de días; con seis horas sobra. */
const CADA_MS = 6 * 60 * 60 * 1000

/** Tope por tanda: una primera ejecución no puede mandar 138 correos de golpe. */
const POR_TANDA = 25

let temporizador = null
let corriendo = false

export function arrancarBarridoDisponibilidad() {
  if (temporizador) return

  const tanda = (cual) =>
    conCerrojo(CERROJOS.DISPONIBILIDAD, barrerDisponibilidad).catch((error) =>
      console.error(`[disponibilidad] ${cual} fallida:`, error.message),
    )

  tanda('primera tanda')
  temporizador = setInterval(() => tanda('tanda'), CADA_MS)
  temporizador.unref?.()

  console.log(
    `[disponibilidad] confirmación periódica activa: se pregunta cada ${CONFIRMAR_CADA_DIAS} días.`,
  )
}

export function detenerBarridoDisponibilidad() {
  if (!temporizador) return
  clearInterval(temporizador)
  temporizador = null
}

/**
 * Pregunta a quien lleve demasiado sin confirmar. Se exporta para poder
 * llamarlo a mano desde un script o desde las pruebas, sin esperar al reloj.
 */
export async function barrerDisponibilidad({ cadaDias } = {}) {
  /**
   * Sin argumento manda Parametrización. Con él, manda quien llama.
   *
   * `cadaCuantosDias()` existía y leía la clave del portal — pero su único
   * llamador era una prueba: el barrido de verdad usaba la constante de
   * entorno, así que girar «cada cuántos días se confirma la disponibilidad»
   * en la pantalla no cambiaba nada. Es el mismo fallo que ya denunció el
   * barrido de asignaciones («girarla no hacía nada, y eso es peor que no
   * tenerla»), reaparecido en otra clave — y con una prueba en verde encima,
   * porque probaba el ayudante y no el barrido.
   */
  if (cadaDias == null) cadaDias = await cadaCuantosDias()

  if (corriendo) return { preguntados: 0, fallidos: 0, revisados: 0 }
  corriendo = true

  const resumen = { preguntados: 0, fallidos: 0, revisados: 0 }

  try {
    const limite = new Date(Date.now() - cadaDias * 86400000)

    /**
     * Solo a quien de verdad puede recibir un caso: activo y con la tarjeta
     * verificada. Preguntarle su disponibilidad a alguien que todavía no es
     * asignable es pedirle algo que no le sirve de nada — y de los 138
     * profesionales vivos, 93 están sin verificar.
     *
     * `availabilityConfirmedAt` null significa «nunca confirmó»: entonces
     * cuenta desde que se registró, que es cuando cargó la agenda.
     */
    const pendientes = await prisma.professional.findMany({
      where: {
        status: 'ACTIVO',
        deletedAt: null,
        professionalCardVerified: true,
        OR: [
          { availabilityConfirmedAt: { lt: limite } },
          { availabilityConfirmedAt: null, createdAt: { lt: limite } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
        availabilityConfirmedAt: true,
        rules: {
          where: { active: true },
          select: { weekday: true, startMinute: true, endMinute: true },
        },
      },
      orderBy: { availabilityConfirmedAt: { sort: 'asc', nulls: 'first' } },
      take: POR_TANDA,
    })

    resumen.revisados = pendientes.length

    for (const profesional of pendientes) {
      try {
        await pedirConfirmacionDeDisponibilidad({
          profesional,
          agenda: describirFranjas(profesional.rules),
          desdeCuando: enPalabras(profesional.availabilityConfirmedAt ?? profesional.createdAt),
          // Su enlace de perfil, donde ya puede editar sus horarios.
          ruta: `/portal/profesionales/${profesional.id}`,
        })
        resumen.preguntados += 1
      } catch (error) {
        resumen.fallidos += 1
        console.error(`[disponibilidad] no pude escribirle a ${profesional.id}:`, error.message)
      }
    }

    if (resumen.preguntados > 0) {
      console.log(`[disponibilidad] preguntado a ${resumen.preguntados} profesionales.`)
    }

    return resumen
  } finally {
    corriendo = false
  }
}
