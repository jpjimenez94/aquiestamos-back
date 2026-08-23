import { prisma } from '../config/database.js'
import { deLocalAUtc, diaDeLaSemana, diasEntre, partesLocales } from './timezone.service.js'
import { DomainError } from '../errors/DomainError.js'
import { VIVOS } from './assignmentState.service.js'

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

const DIA_LARGO = {
  LUNES: 'lunes', MARTES: 'martes', MIERCOLES: 'miércoles', JUEVES: 'jueves',
  VIERNES: 'viernes', SABADO: 'sábados', DOMINGO: 'domingos',
}

/** 870 → "2:30 p. m.". Los minutos de las reglas son hora local de Bogotá. */
function horaLegible(minutos) {
  const h24 = Math.floor(minutos / 60)
  const m = minutos % 60
  const sufijo = h24 < 12 ? 'a. m.' : 'p. m.'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`
}

/**
 * Las franjas declaradas de un profesional, en palabras: "lunes de 8:00 a. m.
 * a 12:00 p. m., miércoles de 2:00 p. m. a 6:00 p. m.".
 *
 * Existe para los mensajes de error: decirle a quien coordina "está fuera de
 * las franjas" sin decirle cuáles son las franjas la obliga a irse a otra
 * pantalla a averiguar lo que el sistema ya sabía.
 */
export async function franjasEnPalabras(professionalId) {
  const reglas = await prisma.availabilityRule.findMany({
    where: { professionalId, active: true },
  })
  return describirFranjas(reglas)
}

/** La parte pura, para poder probarla sin base de datos. */
export function describirFranjas(reglas) {
  if (!reglas?.length) return null

  // En el orden de la semana, no en el del enum de la base.
  const ORDEN = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
  return reglas
    .slice()
    .sort((a, b) => ORDEN.indexOf(a.weekday) - ORDEN.indexOf(b.weekday) || a.startMinute - b.startMinute)
    .map((r) => `${DIA_LARGO[r.weekday] ?? r.weekday} de ${horaLegible(r.startMinute)} a ${horaLegible(r.endMinute)}`)
    .join(', ')
}

/** Cuántos casos activos lleva cada profesional. Se calcula, no se guarda. */
export async function cargaActual(professionalIds) {
  const filas = await prisma.caseAssignment.groupBy({
    by: ['professionalId'],
    where: {
      professionalId: { in: professionalIds },
      // Cuenta tambien las propuestas sin responder: una propuesta ocupa a
      // quien la recibe, aunque todavia no haya dicho que si.
      status: { in: VIVOS },
      deletedAt: null,
    },
    _count: { _all: true },
  })

  const mapa = new Map(filas.map((f) => [f.professionalId, f._count._all]))
  return (id) => mapa.get(id) ?? 0
}
