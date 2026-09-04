import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '../src/config/database.js'
import {
  barrerAsignaciones,
  PROPUESTA_VENCE_DIAS,
  ACEPTADA_VENCE_DIAS,
} from '../src/asignacion/barrido.js'
import { crearCita } from '../src/services/appointment.service.js'

/**
 * El barrido que libera lo que se quedó esperando.
 *
 * No tenía ninguna prueba, y es de las piezas que más consecuencias tienen:
 * cancela asignaciones sin que nadie lo pida, libera el cupo del profesional y
 * devuelve a la persona a la cola. Si se rompe, no falla nada visible — los
 * casos simplemente se quedan quietos, que es exactamente el problema que este
 * barrido vino a resolver. Por eso hay que probarlo: es de las cosas que se
 * rompen en silencio.
 *
 * Barre dos tramos, y desde que asignar dejó de ser pedir permiso ya no pesan
 * lo mismo:
 *
 *   PROPUESTA — el profesional nunca respondió. Ninguna asignación nueva nace
 *   aquí. Se sigue barriendo por las que quedaron de antes, que si no se
 *   quedarían para siempre: nadie va a entrar a responderlas.
 *
 *   ACEPTADA — la persona nunca eligió hora. Este es ahora el único tramo vivo,
 *   y el que de verdad hay que cuidar: es el que puede soltarle el
 *   acompañamiento a alguien que pidió ayuda.
 */

const MARCA = `barrido-${Date.now()}`
let profesionalId
let pacienteId

beforeAll(async () => {
  const profesional = await prisma.professional.create({
    data: {
      fullName: `Profesional ${MARCA}`,
      email: `prof.${MARCA}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
      maxActiveCases: 5,
    },
  })
  profesionalId = profesional.id

  const paciente = await prisma.patient.create({
    data: {
      fullName: `Persona ${MARCA}`,
      phone: '3000000001',
      city: 'Pereira',
      status: 'ASIGNADO',
      priority: 'ALTA',
      preferredModality: 'VIRTUAL',
    },
  })
  pacienteId = paciente.id
})

// Solo puede haber una asignación viva por persona a la vez —hay un índice
// único que lo impide—, así que cada prueba empieza con la mesa limpia.
beforeEach(async () => {
  // Las citas primero: cuelgan de la asignación y la llave foránea no deja
  // borrarla debajo de ellas.
  await prisma.appointment.deleteMany({ where: { patientId: pacienteId } })
  await prisma.caseAssignment.deleteMany({ where: { patientId: pacienteId } })
})

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { patientId: pacienteId } })
  await prisma.caseAssignment.deleteMany({ where: { patientId: pacienteId } })
  await prisma.patient.deleteMany({ where: { id: pacienteId } })
  await prisma.professional.deleteMany({ where: { id: profesionalId } })
  await prisma.notification.deleteMany({ where: { toEmail: { contains: MARCA } } })
})

const DIA = 24 * 3600 * 1000

/** Una asignación ya vieja, en el estado y con la antigüedad que se pida. */
async function asignacionDeHace(estado, hace) {
  const nacio = new Date(Date.now() - hace)
  return prisma.caseAssignment.create({
    data: {
      patientId: pacienteId,
      professionalId: profesionalId,
      status: estado,
      startedAt: nacio,
      // En ACEPTADA el reloj corre desde que el profesional quedó a bordo, no
      // desde que se creó. Hoy son la misma fecha, pero el barrido mira este
      // campo y la prueba tiene que mirar lo mismo que él.
      respondedAt: estado === 'ACEPTADA' ? nacio : null,
    },
  })
}

async function estadoDe(id) {
  const fila = await prisma.caseAssignment.findUnique({ where: { id } })
  return fila.status
}

describe('la persona que nunca eligió hora', () => {
  /**
   * Este es el tramo vivo. El profesional ya está asignado y avisado; lo que
   * falta es que ella entre a su enlace y escoja. Si no lo hace, el cupo se
   * queda ocupado por un acompañamiento que no está ocurriendo.
   */
  it('a los 3 días se libera', async () => {
    const a = await asignacionDeHace('ACEPTADA', 4 * DIA)
    await barrerAsignaciones()
    expect(await estadoDe(a.id)).toBe('CANCELADA')
  })

  /**
   * El plazo de ella es más largo que el del profesional a propósito, y esa
   * razón no ha cambiado: quien pide ayuda puede estar sin batería, sin datos o
   * sin cabeza. Soltar el acompañamiento demasiado rápido castiga justo a quien
   * peor está.
   */
  it('al día siguiente NO se toca', async () => {
    const a = await asignacionDeHace('ACEPTADA', 1 * DIA)
    await barrerAsignaciones()
    expect(await estadoDe(a.id)).toBe('ACEPTADA')
  })

  it('el plazo por defecto son 3 días', () => {
    expect(ACEPTADA_VENCE_DIAS).toBe(3)
  })

  it('liberar le devuelve el cupo al profesional', async () => {
    const a = await asignacionDeHace('ACEPTADA', 4 * DIA)
    await barrerAsignaciones()

    // El cupo se cuenta por asignaciones vivas. Si el barrido cancelara sin
    // pasar por el camino normal, el profesional quedaría ocupado para siempre
    // por alguien a quien no está acompañando.
    const vivas = await prisma.caseAssignment.count({
      where: {
        professionalId: profesionalId,
        status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA'] },
        deletedAt: null,
      },
    })
    expect(vivas).toBe(0)
    expect(await estadoDe(a.id)).toBe('CANCELADA')
  })
})

describe('las propuestas que quedaron de antes', () => {
  /**
   * Ninguna asignación nueva nace en PROPUESTA. Estas son las de antes del
   * cambio, y hay que seguir recogiéndolas: quedaron esperando una respuesta
   * que ya nadie va a dar, porque el enlace donde se respondía dejó de ser
   * parte del camino.
   */
  it('siguen liberándose, aunque ya no se creen', async () => {
    const a = await asignacionDeHace('PROPUESTA', 3 * DIA)
    await barrerAsignaciones()
    expect(await estadoDe(a.id)).toBe('CANCELADA')
  })

  it('el plazo por defecto siguen siendo 2 días', () => {
    expect(PROPUESTA_VENCE_DIAS).toBe(2)
  })
})

describe('un caso que ya tiene sesión agendada', () => {
  /**
   * Coordinación también agenda, y el barrido no puede llevárselo por delante.
   *
   * Hay dos puertas para poner hora: el enlace de la persona —`confirmarHorario`,
   * que sí activaba la asignación— y «Ya me confirmó: agendar», para cuando ella
   * responde por WhatsApp y coordinación transcribe lo que dijo. La segunda pasa
   * por `crearCita`, y `crearCita` no activaba nada: la asignación se quedaba en
   * ACEPTADA con una sesión confirmada colgando.
   *
   * Lo que hacía el barrido con eso era lo peor posible. A los tres días de
   * asignar —el reloj arranca ahí— cancelaba la asignación Y su cita, devolvía a
   * la persona a la cola y le escribía a coordinación diciendo que nadie había
   * agendado. Alguien había agendado, desde el propio portal, y la sesión estaba
   * en la agenda del profesional.
   */
  it('agendar desde coordinación lo pone ACTIVO, y el barrido ya no lo toca', async () => {
    const a = await asignacionDeHace('ACEPTADA', 5 * DIA)

    const inicio = new Date(Date.now() + 3 * DIA)
    const fin = new Date(inicio.getTime() + 45 * 60000)
    await crearCita({
      professionalId: profesionalId,
      patientId: pacienteId,
      inicio,
      fin,
      modalidad: 'VIRTUAL',
      estado: 'CONFIRMADA',
      // El profesional de esta prueba no tiene franjas cargadas; lo que se mira
      // aquí es el estado de la asignación, no la agenda.
      permitirFueraDeFranja: true,
    })

    expect(await estadoDe(a.id)).toBe('ACTIVA')

    await barrerAsignaciones()

    expect(await estadoDe(a.id)).toBe('ACTIVA')
    const cita = await prisma.appointment.findFirst({ where: { caseAssignmentId: a.id } })
    expect(cita.status).toBe('CONFIRMADA')
  })
})

describe('el barrido en general', () => {
  it('el plazo se puede forzar, para no atar la prueba al valor por defecto', async () => {
    const a = await asignacionDeHace('ACEPTADA', 4 * DIA)

    await barrerAsignaciones({ diasAceptada: 10 })
    expect(await estadoDe(a.id)).toBe('ACEPTADA')

    await barrerAsignaciones({ diasAceptada: 1 })
    expect(await estadoDe(a.id)).toBe('CANCELADA')
  })

  /** Lo que sigue vivo y a tiempo no se toca, y el resumen no lo cuenta. */
  it('no se lleva por delante lo que está en curso', async () => {
    const a = await asignacionDeHace('ACTIVA', 30 * DIA)
    const resumen = await barrerAsignaciones()
    expect(await estadoDe(a.id)).toBe('ACTIVA')
    expect(resumen.fallidas).toBe(0)
  })
})
