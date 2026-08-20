#!/usr/bin/env node
/**
 * Purga de retención.
 *
 *   npm run db:purgar            muestra qué borraría, sin tocar nada
 *   npm run db:purgar -- --si    lo borra de verdad
 *
 * La ONG decidió conservar los datos DOS AÑOS desde que se cierra un caso.
 * Este script es lo que convierte esa decisión en algo real: sin él, el
 * borrado lógico solo acumula filas para siempre.
 *
 * Conviene correrlo una vez al mes. En Railway se puede programar como cron.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MESES_RETENCION = 24
const enSerio = process.argv.includes('--si')

function haceMeses(meses) {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d
}

async function main() {
  const limite = haceMeses(MESES_RETENCION)

  console.log('')
  console.log(`Retención: ${MESES_RETENCION} meses`)
  console.log(`Se purga todo lo cerrado o eliminado antes de ${limite.toISOString().slice(0, 10)}`)
  console.log(enSerio ? 'MODO REAL: se va a borrar.' : 'Simulación. Añade --si para borrar de verdad.')
  console.log('')

  // Casos cerrados hace más de dos años, con todo lo que cuelga de ellos.
  const casosViejos = await prisma.caseAssignment.findMany({
    where: { status: 'CERRADA', endedAt: { lt: limite } },
    select: { id: true, patientId: true },
  })

  const idsCasos = casosViejos.map((c) => c.id)
  const idsPacientes = [...new Set(casosViejos.map((c) => c.patientId))]

  // Solo se borra a la persona si TODOS sus casos son viejos.
  const conCasoReciente = await prisma.caseAssignment.findMany({
    where: {
      patientId: { in: idsPacientes },
      OR: [{ status: 'ACTIVA' }, { endedAt: { gte: limite } }],
    },
    select: { patientId: true },
  })
  const protegidos = new Set(conCasoReciente.map((c) => c.patientId))
  const pacientesAPurgar = idsPacientes.filter((id) => !protegidos.has(id))

  const [citas, borradosLogicos, sesionesCaducadas, auditoriaVieja] = await Promise.all([
    prisma.appointment.count({ where: { caseAssignmentId: { in: idsCasos } } }),
    prisma.volunteer.count({ where: { deletedAt: { lt: limite } } }),
    prisma.session.count({ where: { expiresAt: { lt: haceMeses(1) } } }),
    prisma.auditLog.count({ where: { createdAt: { lt: haceMeses(MESES_RETENCION + 12) } } }),
  ])

  const resumen = [
    ['Casos cerrados a purgar', idsCasos.length],
    ['Citas de esos casos', citas],
    ['Personas sin ningún caso reciente', pacientesAPurgar.length],
    ['Postulaciones dadas de baja hace +2 años', borradosLogicos],
    ['Sesiones caducadas hace +1 mes', sesionesCaducadas],
    ['Auditoría de hace +3 años', auditoriaVieja],
  ]

  for (const [etiqueta, valor] of resumen) {
    console.log(`  ${String(valor).padStart(6)}  ${etiqueta}`)
  }
  console.log('')

  if (!enSerio) {
    console.log('No se borró nada. Añade --si cuando quieras ejecutarlo.')
    return
  }

  // El orden importa: primero lo que apunta a otras filas.
  const borradas = await prisma.$transaction([
    prisma.appointment.deleteMany({ where: { caseAssignmentId: { in: idsCasos } } }),
    prisma.caseAssignment.deleteMany({ where: { id: { in: idsCasos } } }),
    prisma.availabilityException.deleteMany({
      where: { professional: { deletedAt: { lt: limite } } },
    }),
    prisma.patient.deleteMany({ where: { id: { in: pacientesAPurgar } } }),
    prisma.supportRequest.deleteMany({ where: { deletedAt: { lt: limite } } }),
    prisma.volunteer.deleteMany({ where: { deletedAt: { lt: limite } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: haceMeses(1) } } }),
    // La auditoría se conserva un año más que los datos: es el rastro de qué
    // pasó con ellos, incluido su borrado.
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: haceMeses(MESES_RETENCION + 12) } } }),
  ])

  const total = borradas.reduce((suma, r) => suma + r.count, 0)
  console.log(`Purga terminada. ${total} filas eliminadas.`)
}

main()
  .catch((error) => {
    console.error('[purga] Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
