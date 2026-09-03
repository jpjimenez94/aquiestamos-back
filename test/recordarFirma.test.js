import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../src/config/database.js'
import { barrerCitas } from '../src/citas/barrido.js'

const marca = `firma-${Date.now()}`
const ids = {}
const hace = (h) => new Date(Date.now() - h * 3600000)

/**
 * Recordarle la firma a quien agendó y no firmó.
 *
 * Sin consentimiento la sesión no puede hacerse: el profesional no debería
 * atenderla. Así que ese espacio está apartado para algo que, tal como está,
 * no va a pasar — y hasta ahora nadie se enteraba hasta el día de la sesión.
 *
 * A las dos horas, quien no firmó se distrajo, no se arrepintió: de quienes
 * firman, la mediana lo hace en unos veinte minutos.
 */
/**
 * Cada cita en su propia hora: la base impide que dos citas vivas del mismo
 * profesional se solapen, y con todas a la misma hora solo entraba la primera.
 */
let siguienteHueco = 48
async function crearCita({ consentSigned = false, creadaHace = 5, empiezaEn = null, conCorreo = true }) {
  const enHoras = empiezaEn ?? (siguienteHueco += 3)
  return prisma.appointment.create({
    data: {
      patientId: conCorreo ? ids.persona : ids.personaSinCorreo,
      professionalId: ids.profesional,
      modality: 'VIRTUAL',
      status: 'CONFIRMADA',
      consentSigned,
      startsAt: new Date(Date.now() + enHoras * 3600000),
      endsAt: new Date(Date.now() + enHoras * 3600000 + 45 * 60000),
      createdAt: hace(creadaHace),
    },
  })
}

beforeAll(async () => {
  const profesional = await prisma.professional.create({
    data: {
      fullName: `Profesional ${marca}`,
      email: `prof.${marca}@pruebas.local`,
      phone: '3000000000',
      city: 'Pereira',
      profession: 'Psicología',
      modality: 'VIRTUAL',
      populations: [],
      status: 'ACTIVO',
    },
  })
  const persona = await prisma.patient.create({
    data: {
      fullName: `Persona ${marca}`,
      phone: '3000000001',
      email: `persona.${marca}@pruebas.local`,
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      preferredModality: 'VIRTUAL',
    },
  })
  const personaSinCorreo = await prisma.patient.create({
    data: {
      fullName: `Sin correo ${marca}`,
      phone: '3000000002',
      city: 'Pereira',
      status: 'EN_ACOMPANAMIENTO',
      preferredModality: 'VIRTUAL',
    },
  })
  Object.assign(ids, {
    profesional: profesional.id,
    persona: persona.id,
    personaSinCorreo: personaSinCorreo.id,
  })
})

afterAll(async () => {
  if (!ids.profesional) return
  const personas = [ids.persona, ids.personaSinCorreo].filter(Boolean)
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: 'falta-consentimiento:' } } })
  await prisma.appointment.deleteMany({ where: { patientId: { in: personas } } })
  await prisma.patient.deleteMany({ where: { id: { in: personas } } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
})

const avisosDe = (citaId) =>
  prisma.notification.count({ where: { dedupeKey: `falta-consentimiento:${citaId}` } })

describe('recordarle la firma', () => {
  it('a quien agendó hace más de dos horas y no ha firmado', async () => {
    const cita = await crearCita({ creadaHace: 5 })
    await barrerCitas()
    expect(await avisosDe(cita.id)).toBe(1)
  })

  it('una sola vez, aunque el barrido corra cada hora', async () => {
    const cita = await crearCita({ creadaHace: 5 })
    await barrerCitas()
    await barrerCitas()
    expect(await avisosDe(cita.id)).toBe(1)
  })

  it('no a quien acaba de agendar: puede estar leyéndolo ahora mismo', async () => {
    const cita = await crearCita({ creadaHace: 0.2 })
    await barrerCitas()
    expect(await avisosDe(cita.id)).toBe(0)
  })

  it('no a quien ya firmó', async () => {
    const cita = await crearCita({ consentSigned: true, creadaHace: 5 })
    await barrerCitas()
    expect(await avisosDe(cita.id)).toBe(0)
  })

  /**
   * La sesión ya pasó: recordarle que firme algo que no va a ocurrir solo
   * confunde. Eso ya es trabajo de coordinación, no de un barrido.
   */
  it('no si la sesión ya pasó', async () => {
    const cita = await crearCita({ creadaHace: 50, empiezaEn: -5 })
    await barrerCitas()
    expect(await avisosDe(cita.id)).toBe(0)
  })

  it('no a quien no dejó correo: el aviso va por correo', async () => {
    const cita = await crearCita({ creadaHace: 5, conCorreo: false })
    await barrerCitas()
    expect(await avisosDe(cita.id)).toBe(0)
  })

  /**
   * Y no le suelta el espacio. Cancelarle la cita en silencio a alguien que
   * pidió ayuda hace más daño que el espacio desperdiciado: quién la suelta y
   * cuándo lo decide coordinación, viéndolo en «Lo que está esperando».
   */
  it('no le cancela la cita', async () => {
    const cita = await crearCita({ creadaHace: 30 })
    await barrerCitas()
    const despues = await prisma.appointment.findUnique({ where: { id: cita.id } })
    expect(despues.status).toBe('CONFIRMADA')
  })
})
