import { prisma } from '../config/database.js'
import { deLocalAUtc, diaDeLaSemana, diasEntre, partesLocales } from './timezone.service.js'
import { DomainError } from '../errors/DomainError.js'

/**
 * SERVICIO: agenda.
 *
 * Los huecos libres se calculan, no se guardan. Materializar una fila por cada
 * franja de 30 minutos de cada profesional serían cientos de miles de filas que
 * hay que mantener sincronizadas; calcularlas sobre un rango acotado es
 * instantáneo y nunca se desincroniza.
 */

/** Duración mínima de una sesión, en minutos. La base también la exige. */
export const DURACION_MINIMA = 45

/** Descanso obligatorio después de cada sesión. */
export const DESCANSO = 30

/** Cada cuántos minutos se ofrece un inicio posible. */
export const GRANULARIDAD = 15

/** No se calculan huecos más allá de este horizonte. */
export const MAX_DIAS = 56

const VIVAS = ['PROGRAMADA', 'CONFIRMADA']

function seSolapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA
}

/**
 * Huecos en los que este profesional podría atender.
 *
 * Un hueco es válido si la SESIÓN cabe dentro de una franja declarada, y si ni
 * la sesión ni su descanso chocan con otra cita. El descanso puede salirse de
 * la franja: es tiempo de descanso, no de atención.
 */
export async function huecosDisponibles({
  professionalId,
  desde,
  hasta,
  duracionMinutos = DURACION_MINIMA,
  descansoMinutos = DESCANSO,
  modalidad,
}) {
  if (duracionMinutos < DURACION_MINIMA) {
    throw new DomainError(
      'DURACION_INSUFICIENTE',
      `Una sesión dura al menos ${DURACION_MINIMA} minutos`,
    )
  }
  if (hasta <= desde) {
    throw new DomainError('RANGO_INVALIDO', 'La fecha final debe ser posterior a la inicial')
  }

  const dias = diasEntre(desde, hasta)
  if (dias.length > MAX_DIAS) {
    throw new DomainError(
      'RANGO_DEMASIADO_LARGO',
      `El rango no puede superar ${MAX_DIAS} días`,
    )
  }

  const [reglas, excepciones, citas] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: {
        professionalId,
        active: true,
        ...(modalidad && modalidad !== 'AMBAS'
          ? { modality: { in: [modalidad, 'AMBAS'] } }
          : {}),
      },
    }),
    prisma.availabilityException.findMany({
      where: { professionalId, endsAt: { gt: desde }, startsAt: { lt: hasta } },
    }),
    prisma.appointment.findMany({
      where: {
        professionalId,
        status: { in: VIVAS },
        // Se traen también las que empiezan antes del rango: su descanso puede
        // invadirlo.
        blocksUntil: { gt: desde },
        startsAt: { lt: hasta },
      },
      select: { startsAt: true, blocksUntil: true, endsAt: true },
    }),
  ])

  if (reglas.length === 0) return []

  const ahora = new Date()
  const huecos = []

  for (const dia of dias) {
    const nombreDia = diaDeLaSemana(deLocalAUtc(dia.year, dia.month, dia.day, 12 * 60))
    const delDia = reglas.filter((r) => r.weekday === nombreDia)

    for (const regla of delDia) {
      let minuto = regla.startMinute

      while (minuto + duracionMinutos <= regla.endMinute) {
        const inicio = deLocalAUtc(dia.year, dia.month, dia.day, minuto)
        const fin = new Date(inicio.getTime() + duracionMinutos * 60000)
        const bloqueoHasta = new Date(fin.getTime() + descansoMinutos * 60000)

        const enRango = inicio >= desde && fin <= hasta
        const enFuturo = inicio > ahora

        const chocaConBloqueo = excepciones.some((e) =>
          seSolapan(inicio, fin, e.startsAt, e.endsAt),
        )

        const chocaConCita = citas.some((c) =>
          seSolapan(inicio, bloqueoHasta, c.startsAt, c.blocksUntil ?? c.endsAt),
        )

        if (enRango && enFuturo && !chocaConBloqueo && !chocaConCita) {
          huecos.push({
            inicio,
            fin,
            modalidad: regla.modality,
            duracionMinutos,
          })
        }

        minuto += GRANULARIDAD
      }
    }
  }

  huecos.sort((a, b) => a.inicio - b.inicio)
  return huecos
}

/**
 * ¿Cae este horario dentro de una franja declarada por el profesional?
 * La restricción de exclusión impide los choques, pero no sabe nada de las
 * franjas: eso se comprueba aquí.
 */
export async function dentroDeDisponibilidad({ professionalId, inicio, fin }) {
  const p = partesLocales(inicio)
  const nombreDia = diaDeLaSemana(inicio)

  const reglas = await prisma.availabilityRule.findMany({
    where: { professionalId, active: true, weekday: nombreDia },
  })

  const cabe = reglas.some((regla) => {
    const desdeRegla = deLocalAUtc(p.year, p.month, p.day, regla.startMinute)
    const hastaRegla = deLocalAUtc(p.year, p.month, p.day, regla.endMinute)
    return inicio >= desdeRegla && fin <= hastaRegla
  })

  if (!cabe) {
    const excepcion = await prisma.availabilityException.findFirst({
      where: { professionalId, startsAt: { lt: fin }, endsAt: { gt: inicio } },
    })
    return { cabe: false, motivo: excepcion ? 'BLOQUEO' : 'FUERA_DE_FRANJA' }
  }

  const excepcion = await prisma.availabilityException.findFirst({
    where: { professionalId, startsAt: { lt: fin }, endsAt: { gt: inicio } },
  })

  return excepcion ? { cabe: false, motivo: 'BLOQUEO' } : { cabe: true }
}

/** Cuántos casos activos lleva cada profesional. Se calcula, no se guarda. */
export async function cargaActual(professionalIds) {
  const filas = await prisma.caseAssignment.groupBy({
    by: ['professionalId'],
    where: {
      professionalId: { in: professionalIds },
      status: 'ACTIVA',
      deletedAt: null,
    },
    _count: { _all: true },
  })

  const mapa = new Map(filas.map((f) => [f.professionalId, f._count._all]))
  return (id) => mapa.get(id) ?? 0
}
