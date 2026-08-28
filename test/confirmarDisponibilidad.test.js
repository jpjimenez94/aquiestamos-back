import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '../src/config/database.js'
import { barrerDisponibilidad, CONFIRMAR_CADA_DIAS } from '../src/disponibilidad/barrido.js'

/**
 * Preguntarle al profesional si su agenda sigue al día.
 *
 * Es la condición que hace justo asignar sin preguntar. Cuando se quitó el paso
 * de pedirle permiso, se escribió que eso solo era legítimo con tres cosas:
 * que declinar siguiera siendo un toque, que solo se asignara a quien tiene
 * cupo, y que su agenda estuviera cargada. Las dos primeras se cumplían; la
 * tercera se cumplía el día que se registró, y nada volvía a mirarla.
 *
 * Una agenda de hace ocho meses no es un dato viejo: es una persona que pidió
 * ayuda esperando a una hora en la que él ya no está. Y nadie se entera, porque
 * la ausencia de queja se parece mucho a que todo va bien.
 */

const MARCA = `disp-${Date.now()}`
const ids = {}
const DIA = 86400000

async function crearProfesional(sufijo, extra = {}) {
  return prisma.professional.create({
    data: {
      fullName: `Profesional ${sufijo} ${MARCA}`,
      email: `${sufijo}.${MARCA}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
      professionalCardVerified: true,
      ...extra,
    },
  })
}

beforeAll(async () => {
  const hace60 = new Date(Date.now() - 60 * DIA)

  const [viejo, reciente, sinVerificar, inactivo, nuevo] = await Promise.all([
    crearProfesional('viejo', { availabilityConfirmedAt: hace60 }),
    crearProfesional('reciente', { availabilityConfirmedAt: new Date(Date.now() - 2 * DIA) }),
    crearProfesional('sinverificar', { professionalCardVerified: false, availabilityConfirmedAt: hace60 }),
    crearProfesional('inactivo', { status: 'INACTIVO', availabilityConfirmedAt: hace60 }),
    // Nunca confirmó y se registró hace poco: todavía no toca preguntarle.
    crearProfesional('nuevo'),
  ])

  Object.assign(ids, {
    viejo: viejo.id,
    reciente: reciente.id,
    sinVerificar: sinVerificar.id,
    inactivo: inactivo.id,
    nuevo: nuevo.id,
  })
})

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { toEmail: { contains: MARCA } } })
})

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { toEmail: { contains: MARCA } } })
  await prisma.professional.deleteMany({ where: { id: { in: Object.values(ids) } } })
})

async function avisadosA() {
  const avisos = await prisma.notification.findMany({
    where: { toEmail: { contains: MARCA } },
    select: { toEmail: true },
  })
  return avisos.map((a) => a.toEmail)
}

describe('a quién se le pregunta', () => {
  it('el plazo por defecto es de un mes', () => {
    expect(CONFIRMAR_CADA_DIAS).toBe(30)
  })

  it('a quien lleva dos meses sin confirmar', async () => {
    await barrerDisponibilidad()
    expect(await avisadosA()).toContain(`viejo.${MARCA}@pruebas.local`)
  })

  it('no a quien confirmó hace dos días', async () => {
    await barrerDisponibilidad()
    expect(await avisadosA()).not.toContain(`reciente.${MARCA}@pruebas.local`)
  })

  /**
   * Solo a quien de verdad puede recibir un caso. Preguntarle su
   * disponibilidad a alguien que todavía no es asignable es pedirle algo que
   * no le sirve de nada — y de los 138 profesionales vivos, 93 están sin
   * verificar.
   */
  it('no a quien no es asignable todavía', async () => {
    await barrerDisponibilidad()
    const avisados = await avisadosA()
    expect(avisados).not.toContain(`sinverificar.${MARCA}@pruebas.local`)
    expect(avisados).not.toContain(`inactivo.${MARCA}@pruebas.local`)
  })

  /** Quien acaba de registrarse cargó su agenda hace nada: aún no toca. */
  it('no a quien se acaba de registrar', async () => {
    await barrerDisponibilidad()
    expect(await avisadosA()).not.toContain(`nuevo.${MARCA}@pruebas.local`)
  })

  /**
   * Uno por profesional y por mes, aunque el barrido corra veinte veces. La
   * clave de deduplicación lleva el mes, así que ni un reinicio del servidor
   * duplica el correo.
   */
  it('no le escribe dos veces en el mismo mes', async () => {
    await barrerDisponibilidad()
    await barrerDisponibilidad()
    await barrerDisponibilidad()

    const avisados = await avisadosA()
    const alViejo = avisados.filter((e) => e === `viejo.${MARCA}@pruebas.local`)
    expect(alViejo).toHaveLength(1)
  })

  /** El plazo se puede forzar, para no atar la prueba al valor por defecto. */
  it('el plazo se puede forzar', async () => {
    const r = await barrerDisponibilidad({ cadaDias: 3650 })
    expect(r.preguntados).toBe(0)
  })
})

describe('confirmar cierra el círculo', () => {
  /**
   * Tocar la agenda ES confirmarla. Si guardar los horarios no contara como
   * respuesta, se le seguiría preguntando cada mes a alguien que acaba de
   * actualizarlos — y un recordatorio que llega después de haber hecho lo que
   * pedía es la forma más rápida de que alguien deje de leer los correos de la
   * red.
   */
  it('al marcar la fecha, deja de preguntársele', async () => {
    await prisma.professional.update({
      where: { id: ids.viejo },
      data: { availabilityConfirmedAt: new Date() },
    })

    await barrerDisponibilidad()
    expect(await avisadosA()).not.toContain(`viejo.${MARCA}@pruebas.local`)
  })
})
