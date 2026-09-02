import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../src/config/database.js'
import { cerrarSesionesConPrueba } from '../src/citas/cierre.js'

const marca = `cierre-${Date.now()}`
const ids = {}
const hace = (h) => new Date(Date.now() - h * 3600000)

/**
 * «Marcar como realizada» era un clic humano por sesión, y nadie se acordaba.
 * El sistema ya sabía si la sesión ocurrió —lo dice el reporte del
 * profesional, o la sala—; ahora lo usa para cerrar la cita solo.
 */
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
    data: { fullName: `Persona ${marca}`, phone: '3000000001', city: 'Pereira', status: 'EN_ACOMPANAMIENTO', preferredModality: 'VIRTUAL' },
  })
  const asignacion = await prisma.caseAssignment.create({
    data: { patientId: persona.id, professionalId: profesional.id, status: 'ACTIVA' },
  })
  const comun = { patientId: persona.id, professionalId: profesional.id, caseAssignmentId: asignacion.id, modality: 'VIRTUAL', status: 'CONFIRMADA' }
  const crear = (extra) => prisma.appointment.create({ data: { ...comun, ...extra } })

  // 1 · Pasada, reportada como atendida.
  const reportada = await crear({ startsAt: hace(50), endsAt: hace(49) })
  await prisma.caseReport.create({
    data: { assignmentId: asignacion.id, outcome: 'YA_ATENDIDA', followUp: 'SUFICIENTE', reportedByEmail: profesional.email, createdAt: hace(48) },
  })
  // 2 · Pasada, reportada como ausencia.
  const ausente = await crear({ startsAt: hace(30), endsAt: hace(29) })
  await prisma.caseReport.create({
    data: { assignmentId: asignacion.id, outcome: 'NO_ASISTIO', reportedByEmail: profesional.email, createdAt: hace(28) },
  })
  // 3 · Pasada, sin reporte pero con las dos personas en la sala.
  const conSala = await crear({ startsAt: hace(20), endsAt: hace(19), patientFirstJoinedAt: hace(20), professionalFirstJoinedAt: hace(20) })
  // 4 · Pasada, sin ninguna prueba: se queda como está.
  const sinPrueba = await crear({ startsAt: hace(10), endsAt: hace(9) })
  // 5 · Futura: no se toca aunque hubiera rastro.
  const futura = await crear({ startsAt: hace(-24), endsAt: new Date(hace(-24).getTime() + 45 * 60000) })

  Object.assign(ids, { profesional: profesional.id, persona: persona.id, asignacion: asignacion.id, reportada: reportada.id, ausente: ausente.id, conSala: conSala.id, sinPrueba: sinPrueba.id, futura: futura.id })
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [ids.reportada, ids.ausente, ids.conSala, ids.sinPrueba, ids.futura] } } })
  await prisma.caseReport.deleteMany({ where: { assignmentId: ids.asignacion } })
  await prisma.appointment.deleteMany({ where: { patientId: ids.persona } })
  await prisma.caseAssignment.deleteMany({ where: { id: ids.asignacion } })
  await prisma.patient.deleteMany({ where: { id: ids.persona } })
  await prisma.professional.deleteMany({ where: { id: ids.profesional } })
})

const estadoDe = async (id) => (await prisma.appointment.findUnique({ where: { id }, select: { status: true } })).status

describe('cerrar las sesiones que ya tienen prueba', () => {
  it('cierra lo que se puede y deja lo demás', async () => {
    const r = await cerrarSesionesConPrueba({ patientId: ids.persona })
    expect(r.realizadas).toBe(2)
    expect(r.ausencias).toBe(1)

    expect(await estadoDe(ids.reportada)).toBe('REALIZADA')
    expect(await estadoDe(ids.ausente)).toBe('NO_ASISTIO')
    expect(await estadoDe(ids.conSala)).toBe('REALIZADA')
    expect(await estadoDe(ids.sinPrueba)).toBe('CONFIRMADA')
    expect(await estadoDe(ids.futura)).toBe('CONFIRMADA')
  })

  it('deja rastro en la auditoría de por qué cerró cada una', async () => {
    const huellas = await prisma.auditLog.findMany({ where: { entityId: ids.conSala, actorEmail: 'sistema:cierre-de-sesiones' } })
    expect(huellas.length).toBe(1)
    expect(huellas[0].after.prueba).toContain('sala')
  })

  it('es idempotente: la segunda pasada no toca nada', async () => {
    const r = await cerrarSesionesConPrueba({ patientId: ids.persona })
    expect(r.realizadas + r.ausencias).toBe(0)
  })
})
