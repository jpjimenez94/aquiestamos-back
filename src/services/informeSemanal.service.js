import { prisma } from '../config/database.js'
import { partesLocales, deLocalAUtc } from './timezone.service.js'

/**
 * SERVICIO: el informe semanal del área de Operaciones y Atención.
 *
 * Todas las semanas hay que llenar a mano un documento con las cifras de la
 * red: cuántas solicitudes entraron, cuántas personas están en acompañamiento,
 * qué casos no avanzan y por qué. Las cifras ya están todas en la base; lo que
 * costaba era sacarlas una por una, pantalla por pantalla, contando a ojo —y
 * de ahí salían números con asterisco, como «75 citas (se incluyen pruebas)».
 *
 * Esto las calcula de una vez para una semana concreta. No redacta nada: los
 * logros, los obstáculos y las prioridades los escribe quien dirige el área,
 * porque son criterio y no datos.
 *
 * Dos clases de cifra conviven aquí a propósito, y van etiquetadas:
 *
 *   · De la semana — lo que pasó entre lunes y domingo: solicitudes que
 *     entraron, casos que se cerraron, citas que se hicieron.
 *   · De hoy — una foto del momento: cuántas personas hay en acompañamiento,
 *     cuántos profesionales activos. Preguntar «cuántos hubo la semana pasada»
 *     no tiene sentido para un saldo; lo que importa es cómo está ahora.
 */

const DIA = 24 * 60 * 60 * 1000

/**
 * La semana, en hora de Bogotá, de lunes 00:00 a domingo 23:59.
 *
 * Se calcula con las partes LOCALES y no con `getDay()` del proceso: el
 * servidor corre en UTC, así que por la noche ya es el día siguiente y la
 * semana saldría corrida un día. Es el mismo cuidado que el resto de la
 * agenda.
 */
export function semanaDe(fecha = new Date()) {
  const p = partesLocales(fecha)
  const mediodiaLocal = deLocalAUtc(p.year, p.month, p.day, 12 * 60)

  // 0 = domingo en JS; aquí la semana empieza el lunes.
  const diaSemana = (new Date(mediodiaLocal).getUTCDay() + 6) % 7
  const lunes = new Date(mediodiaLocal.getTime() - diaSemana * DIA)
  const pl = partesLocales(lunes)

  const desde = deLocalAUtc(pl.year, pl.month, pl.day, 0)
  const hasta = new Date(desde.getTime() + 7 * DIA)
  return { desde, hasta }
}

/** La semana que acaba de cerrar: es la que se informa el lunes. */
export function semanaPasada(ahora = new Date()) {
  const estaSemana = semanaDe(ahora)
  return semanaDe(new Date(estaSemana.desde.getTime() - 3 * DIA))
}

const diasDesde = (fecha) => Math.floor((Date.now() - new Date(fecha).getTime()) / DIA)

/** Las cifras y las listas del informe, para una semana concreta. */
export async function informeSemanal({ desde, hasta }) {
  const rango = { gte: desde, lt: hasta }

  const [
    colaboradores,
    colaboradoresNuevos,
    colaboradoresPorArea,
    tareasDeLaSemana,
    solicitudes,
    personasPorEstado,
    personasNuevas,
    citasPorEstado,
    citasDeLaSemana,
    asignacionesCerradas,
    profesionales,
    profesionalesConCaso,
    profesionalesNuevos,
    checkIns,
    noContestan,
    sinElegirHora,
    sinProfesional,
  ] = await Promise.all([
    prisma.collaborator.count({ where: { deletedAt: null } }),
    prisma.collaborator.count({ where: { deletedAt: null, createdAt: rango } }),
    prisma.collaborator.groupBy({
      by: ['area'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    // «Activo» no es el estado del registro, es haber hecho algo: quien tuvo
    // una tarea en la semana. Es la definición que usa el informe a mano.
    prisma.taskAssignment.findMany({
      where: { createdAt: rango },
      select: { collaboratorId: true },
      distinct: ['collaboratorId'],
    }),
    prisma.supportRequest.count({ where: { deletedAt: null, createdAt: rango } }),
    prisma.patient.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.patient.count({ where: { deletedAt: null, createdAt: rango } }),
    prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.appointment.groupBy({ by: ['status'], where: { startsAt: rango }, _count: { _all: true } }),
    prisma.caseAssignment.count({
      where: { status: 'CERRADA', endedAt: rango, deletedAt: null },
    }),
    prisma.professional.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.caseAssignment.findMany({
      where: { status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA'] }, deletedAt: null },
      select: { professionalId: true },
      distinct: ['professionalId'],
    }),
    prisma.professional.count({ where: { deletedAt: null, createdAt: rango } }),
    prisma.professionalCheckIn.count({ where: { createdAt: rango } }),
    // Las listas que hay que buscar a mano, una por una.
    prisma.patient.findMany({
      where: { deletedAt: null, unreachableSince: { not: null }, status: { not: 'CERRADO' } },
      orderBy: { unreachableLastAt: 'asc' },
      select: {
        id: true,
        fullName: true,
        priority: true,
        unreachableSince: true,
        unreachableLastAt: true,
        unreachableTries: true,
        unreachableReason: true,
      },
    }),
    prisma.caseAssignment.findMany({
      where: { status: 'ACEPTADA', deletedAt: null },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        startedAt: true,
        patient: { select: { id: true, fullName: true, priority: true } },
        professional: { select: { fullName: true } },
      },
    }),
    prisma.patient.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['CERRADO'] },
        unreachableSince: null,
        assignments: { none: { status: { in: ['PROPUESTA', 'ACEPTADA', 'ACTIVA'] }, deletedAt: null } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fullName: true, priority: true, createdAt: true },
    }),
  ])

  const porEstado = (filas) =>
    Object.fromEntries(filas.map((f) => [f.status ?? f.area, f._count._all]))

  const personas = porEstado(personasPorEstado)
  const citas = porEstado(citasPorEstado)
  const citasSemana = porEstado(citasDeLaSemana)
  const profes = porEstado(profesionales)

  const activosEnLaSemana = tareasDeLaSemana.length
  const registrados = colaboradores

  return {
    periodo: { desde, hasta: new Date(hasta.getTime() - 1) },

    voluntariado: {
      registrados,
      nuevosEnLaSemana: colaboradoresNuevos,
      /** Quien tuvo al menos una tarea asignada en la semana. */
      activosEnLaSemana,
      porcentajeActivos: registrados ? Math.round((activosEnLaSemana / registrados) * 1000) / 10 : 0,
      porArea: colaboradoresPorArea
        .map((a) => ({ area: a.area, cuantos: a._count._all }))
        .sort((a, b) => b.cuantos - a.cuantos),
    },

    atenciones: {
      solicitudesRecibidas: solicitudes,
      enAcompanamiento: personas.EN_ACOMPANAMIENTO ?? 0,
      enAdmision: personas.EN_ADMISION ?? 0,
      nuevas: personas.NUEVO ?? 0,
      asignadas: personas.ASIGNADO ?? 0,
      cerradas: personas.CERRADO ?? 0,
      citasHistorico: Object.values(citas).reduce((a, b) => a + b, 0),
      citasCanceladasHistorico: citas.CANCELADA ?? 0,
      citasDeLaSemana: Object.values(citasSemana).reduce((a, b) => a + b, 0),
      citasRealizadasEnLaSemana: citasSemana.REALIZADA ?? 0,
      citasCanceladasEnLaSemana: citasSemana.CANCELADA ?? 0,
      citasSinAsistirEnLaSemana: citasSemana.NO_ASISTIO ?? 0,
      citasPorDelante: (citasSemana.PROGRAMADA ?? 0) + (citasSemana.CONFIRMADA ?? 0),
    },

    casos: {
      nuevosEnLaSemana: personasNuevas,
      cerradosEnLaSemana: asignacionesCerradas,
      /**
       * Nadie registra las derivaciones a la red externa de salud: no hay
       * campo donde apuntarlas. Va en null —y no en cero— para que el informe
       * diga «no lo sabemos» en vez de afirmar que no hubo ninguna.
       */
      derivadosRedExterna: null,
    },

    profesionales: {
      activos: profes.ACTIVO ?? 0,
      pausados: profes.PAUSADO ?? 0,
      inactivos: profes.INACTIVO ?? 0,
      pendientesDeValidar: profes.PENDIENTE_VALIDACION ?? 0,
      conCasosAsignados: profesionalesConCaso.length,
      nuevosEnLaSemana: profesionalesNuevos,
      pidieronApoyoEnLaSemana: checkIns,
    },

    // Lo que hoy se busca pantalla por pantalla.
    pendientes: {
      noContestan: noContestan.map((p) => ({
        id: p.id,
        nombre: p.fullName,
        prioridad: p.priority,
        motivo: p.unreachableReason,
        intentos: p.unreachableTries,
        diasSinContacto: diasDesde(p.unreachableSince),
        ultimoIntento: p.unreachableLastAt,
      })),
      sinElegirHora: sinElegirHora.map((a) => ({
        id: a.patient.id,
        nombre: a.patient.fullName,
        prioridad: a.patient.priority,
        profesional: a.professional?.fullName ?? null,
        diasEsperando: diasDesde(a.startedAt),
      })),
      sinProfesional: sinProfesional.map((p) => ({
        id: p.id,
        nombre: p.fullName,
        prioridad: p.priority,
        diasEsperando: diasDesde(p.createdAt),
      })),
    },
  }
}
