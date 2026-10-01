import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { registrar, ACCION } from './src/services/audit.service.js'

/**
 * La sesión de Angie sí se hizo: se corrige la cita que ya existe.
 *
 * Lo que pasó: no se presentó el 17, lo recuadraron por WhatsApp y la sesión
 * ocurrió el 18 a las 8:00. El profesional lo dejó dicho en su reporte —«cita
 * acordada para el 18»— pero nadie volvió al portal, así que la fila del 17
 * quedó como «no asistió» y el caso terminaba ahí.
 *
 * Se corrige esa misma fila, no se crea otra: pasa a REALIZADA y se le mueve
 * la hora al 18 a las 8:00.
 *
 * La hora se mueve por algo más que la exactitud: el reporte de «no se
 * presentó» se empareja con la cita por cercanía en el tiempo, así que
 * dejándola el 17 quedaría una sesión realizada con un reporte diciendo que no
 * se presentó. Movida al 18, ese reporte deja de colgar de ella y la ficha pide
 * lo que toca — el reporte de la sesión y la retroalimentación de Angie.
 *
 * La cita se busca por persona y hora, no por su identificador: el id es un
 * UUID y no se puede buscar por el trozo que se ve en la pantalla.
 */
const prisma = new PrismaClient()

const PACIENTE = '2b18eb97-4f5f-4a9a-8dcc-5737196e0edc'
const INICIO_VIEJO = new Date('2026-09-17T18:00:00.000Z') // 17/09, 1:00 p. m. Bogotá
const INICIO_NUEVO = new Date('2026-09-18T13:00:00.000Z') // 18/09, 8:00 a. m. Bogotá
const MINUTOS = 45

// ¿Ya está corregida? Entonces no se toca nada: esto se puede correr dos veces.
const yaCorregida = await prisma.appointment.findFirst({
  where: { patientId: PACIENTE, startsAt: INICIO_NUEVO },
  select: { id: true, status: true, startsAt: true },
})
if (yaCorregida) {
  console.log('Ya estaba corregida, no se toca nada:', {
    id: yaCorregida.id,
    estado: yaCorregida.status,
    inicio: yaCorregida.startsAt.toISOString(),
  })
  await prisma.$disconnect()
  process.exit(0)
}

const cita = await prisma.appointment.findFirst({
  where: { patientId: PACIENTE, startsAt: INICIO_VIEJO, status: 'NO_ASISTIO' },
  include: {
    patient: { select: { fullName: true } },
    professional: { select: { id: true, fullName: true } },
  },
})
if (!cita) {
  console.log('No encuentro la cita del 17 como «no asistió». No se toca nada.')
  await prisma.$disconnect()
  process.exit(1)
}

console.log('ANTES:', {
  id: cita.id,
  estado: cita.status,
  inicio: cita.startsAt.toISOString(),
  persona: cita.patient.fullName,
  profesional: cita.professional.fullName,
})

const fin = new Date(INICIO_NUEVO.getTime() + MINUTOS * 60000)

// Que la hora nueva no choque con otra sesión del profesional: la base tiene
// una restricción de exclusión y rechazaría el cambio.
const choque = await prisma.appointment.findFirst({
  where: {
    id: { not: cita.id },
    professionalId: cita.professional.id,
    status: { notIn: ['CANCELADA', 'REPROGRAMADA'] },
    startsAt: { lt: new Date(fin.getTime() + 30 * 60000) },
    endsAt: { gt: INICIO_NUEVO },
  },
  select: { id: true, startsAt: true },
})
if (choque) {
  console.log('CHOCA con otra cita del profesional, no se cambia nada:', choque)
  await prisma.$disconnect()
  process.exit(1)
}

const corregida = await prisma.appointment.update({
  where: { id: cita.id },
  data: { status: 'REALIZADA', startsAt: INICIO_NUEVO, endsAt: fin },
})

await registrar({
  req: null,
  action: ACCION.EDITAR,
  entity: 'cita',
  entityId: cita.id,
  actorEmail: 'correccion:sesion-fuera-del-portal',
  before: { estado: cita.status, inicio: cita.startsAt },
  after: {
    estado: corregida.status,
    inicio: corregida.startsAt,
    motivo:
      'La persona no se presentó el 17; la sesión se recuadró por WhatsApp y se hizo el 18 a las 8:00. Lo confirman el profesional y la persona. Se corrige la misma cita en vez de crear otra.',
  },
})

console.log('DESPUÉS:', {
  id: corregida.id,
  estado: corregida.status,
  inicio: corregida.startsAt.toISOString(),
  fin: corregida.endsAt.toISOString(),
})

await prisma.$disconnect()
