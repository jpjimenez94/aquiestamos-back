import { prisma } from '../config/database.js'
import { DomainError } from '../errors/DomainError.js'
import { SettingsService } from './settings.service.js'
import { huboSesion } from './appointmentState.service.js'

/**
 * SERVICIO: cuidado del equipo.
 *
 * Quien acompaña también se carga, y la red no tenía dónde verlo. Tres
 * piezas, todas aparte del acompañamiento:
 *
 *   1. El check-in. A partir de cierto número de sesiones hechas —en toda la
 *      red, con cualquier persona, porque es la carga acumulada la que quema—
 *      el profesional puede decir cómo está desde su mismo enlace del caso.
 *   2. El supervisor. Quién puede facilitar sesiones grupales ya se sabe por
 *      el formulario de voluntarios: coordinación se lo pregunta por WhatsApp
 *      y lo marca desde su ficha. No se le pregunta desde el enlace del caso.
 *   3. La sesión grupal. Coordinación la convoca eligiendo facilitador, hora,
 *      enlace e invitados; llega con las preguntas que dejaron los invitados
 *      al pedir el espacio, para no empezar de cero.
 *
 * Nada de esto toca citas, asignaciones ni reportes: los lee para contar
 * sesiones y nada más.
 */

/** Por debajo de esto no se abre el espacio. El valor real vive en Parametrización. */
export const SESIONES_PARA_CHECKIN = 3

export const ETIQUETAS_NECESIDAD = {
  APOYO_PARA_MI: 'quiere apoyo para sí',
  AYUDA_CON_UN_CASO: 'necesita ayuda con un caso',
  DESCARGARME: 'quiere descargarse',
}

export async function umbralDeCheckIn() {
  return SettingsService.getNumero('SESIONES_PARA_CHECKIN', SESIONES_PARA_CHECKIN)
}

/**
 * Cuántas sesiones ha hecho este profesional en la red, con cualquier persona.
 *
 * «Hecha» lo decide `huboSesion`, la misma regla que usan las métricas —el
 * reporte del profesional, la casilla de coordinación o que los dos entraran
 * a la sala—. Contar aquí con otra regla es como acabarían diciendo cosas
 * distintas la ficha del profesional y este módulo.
 */
export async function sesionesHechasPor(professionalId) {
  const [citas, reportes] = await Promise.all([
    prisma.appointment.findMany({
      where: { professionalId, patient: { deletedAt: null } },
      select: {
        id: true,
        startsAt: true,
        status: true,
        caseAssignmentId: true,
        patientFirstJoinedAt: true,
        professionalFirstJoinedAt: true,
      },
    }),
    prisma.caseReport.findMany({
      where: { assignment: { professionalId } },
      select: { id: true, assignmentId: true, outcome: true, createdAt: true },
    }),
  ])
  return citas.filter((c) => huboSesion(c, reportes, citas)).length
}

/** Lo que el enlace del caso necesita saber para pintar el bloque. */
export async function estadoDeCuidado(professionalId) {
  const [sesiones, umbral, checkIns] = await Promise.all([
    sesionesHechasPor(professionalId),
    umbralDeCheckIn(),
    prisma.professionalCheckIn.findMany({
      where: { professionalId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        need: true,
        createdAt: true,
        groupSession: { select: { id: true, startsAt: true, status: true } },
      },
    }),
  ])

  return {
    sesiones,
    umbral,
    habilitado: sesiones >= umbral,
    checkIns: checkIns.map((c) => ({
      id: c.id,
      necesidad: c.need,
      necesidadLegible: ETIQUETAS_NECESIDAD[c.need] ?? c.need,
      fecha: c.createdAt,
      sesionGrupal: c.groupSession
        ? { id: c.groupSession.id, cuando: c.groupSession.startsAt, estado: c.groupSession.status }
        : null,
    })),
  }
}

/**
 * «¿Cómo estás tú?» Se puede llenar cuantas veces haga falta, pero solo desde
 * que se cruza el umbral: antes, el botón no existe en la pantalla y la
 * puerta lo vuelve a comprobar aquí, porque una regla que solo vive en la
 * pantalla no es una regla.
 */
export async function crearCheckIn({ professionalId, need, notes, questionForGroup }) {
  const { sesiones, umbral, habilitado } = await estadoDeCuidado(professionalId)
  if (!habilitado) {
    throw new DomainError(
      'CHECKIN_ANTES_DE_TIEMPO',
      `Este espacio se abre a partir de ${umbral} ${umbral === 1 ? 'sesión' : 'sesiones'}; llevas ${sesiones}.`,
      { sesiones, umbral },
    )
  }
  return prisma.professionalCheckIn.create({
    data: {
      professionalId,
      need,
      notes: notes?.trim() ? notes.trim() : null,
      questionForGroup: questionForGroup?.trim() ? questionForGroup.trim() : null,
      sessionsAtCheckIn: sesiones,
    },
    include: { professional: { select: { id: true, fullName: true, email: true } } },
  })
}

/**
 * Marcar a alguien como supervisor, o quitarlo. Lo hace coordinación desde
 * la ficha: quién puede facilitar ya se sabe por el formulario de
 * voluntarios y se cuadra por WhatsApp. Se registra cuándo, para saber desde
 * cuándo cuenta.
 */
export async function marcarSupervisor(professionalId, disponible) {
  return prisma.professional.update({
    where: { id: professionalId },
    data: {
      supervisorVolunteer: disponible,
      supervisorVolunteerAt: disponible ? new Date() : null,
    },
    select: { id: true, fullName: true, supervisorVolunteer: true, supervisorVolunteerAt: true },
  })
}

/**
 * Quién puede facilitar: se ofreció, está activo y tiene la tarjeta
 * verificada. Lo tercero no es un detalle —es el mismo requisito que para
 * acompañar a una persona, y aquí acompaña a varios colegas a la vez.
 */
export function supervisoresDisponibles() {
  return prisma.professional.findMany({
    where: {
      supervisorVolunteer: true,
      status: 'ACTIVO',
      deletedAt: null,
      professionalCardVerified: true,
    },
    orderBy: { supervisorVolunteerAt: 'asc' },
    select: { id: true, fullName: true, city: true, modality: true, supervisorVolunteerAt: true },
  })
}

/**
 * A quién puede coordinación ofrecerle el espacio hoy.
 *
 * El bloque «¿Cómo estás tú?» vive al final del enlace del caso, y el
 * profesional solo lo ve si entra. Sin esta lista, el módulo esperaba a que
 * alguien se acordara solo de pedir ayuda —justo lo que no hace quien está
 * cargado—, y coordinación no tenía forma de saber a quién ofrecérselo.
 *
 * Son los que ya cruzaron el umbral y no tienen una petición sin atender. Hace
 * falta además un caso abierto suyo: el enlace del bloque es el de un caso, y
 * sin ninguno vivo no hay puerta por la que mandarlo.
 */
export async function profesionalesParaOfrecerles(umbral, cuenta) {
  const asignaciones = await prisma.caseAssignment.findMany({
    where: { status: { in: ['ACEPTADA', 'ACTIVA'] }, deletedAt: null, patient: { deletedAt: null } },
    select: {
      patientId: true,
      professional: {
        select: { id: true, fullName: true, phone: true, status: true, deletedAt: true },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  const pendientes = await prisma.professionalCheckIn.findMany({
    where: { groupSessionId: null },
    select: { professionalId: true },
  })
  const yaPidieron = new Set(pendientes.map((p) => p.professionalId))

  const ultimos = await prisma.professionalCheckIn.findMany({
    orderBy: { createdAt: 'desc' },
    select: { professionalId: true, createdAt: true },
  })
  const ultimaVez = new Map()
  for (const c of ultimos) if (!ultimaVez.has(c.professionalId)) ultimaVez.set(c.professionalId, c.createdAt)

  const vistos = new Map()
  for (const a of asignaciones) {
    const p = a.professional
    if (!p || p.deletedAt || p.status !== 'ACTIVO') continue
    if (yaPidieron.has(p.id) || vistos.has(p.id)) continue
    const sesiones = cuenta(p.id)
    if (sesiones < umbral) continue
    vistos.set(p.id, {
      id: p.id,
      nombre: p.fullName,
      telefono: p.phone,
      sesiones,
      // Uno de sus casos abiertos: por ahí entra al bloque.
      pacienteId: a.patientId,
      ultimaVez: ultimaVez.get(p.id) ?? null,
    })
  }
  return [...vistos.values()].sort((a, b) => b.sesiones - a.sesiones)
}

/** Lo que ve coordinación al abrir el módulo. */
export async function resumenParaCoordinacion() {
  const [pendientes, supervisores, sesiones] = await Promise.all([
    prisma.professionalCheckIn.findMany({
      where: { groupSessionId: null, professional: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      include: { professional: { select: { id: true, fullName: true, city: true, phone: true } } },
    }),
    supervisoresDisponibles(),
    prisma.supportGroupSession.findMany({
      orderBy: { startsAt: 'desc' },
      take: 20,
      include: {
        facilitator: { select: { id: true, fullName: true } },
        invitations: { include: { professional: { select: { id: true, fullName: true } } } },
      },
    }),
  ])

  const umbral = await umbralDeCheckIn()
  const cuenta = await sesionesHechasPorTodos()

  return {
    umbral,
    checkInsPendientes: pendientes.map(vistaCheckIn),
    paraOfrecer: await profesionalesParaOfrecerles(umbral, cuenta),
    supervisores,
    sesiones: sesiones.map(vistaSesion),
  }
}

function vistaCheckIn(c) {
  return {
    id: c.id,
    profesional: c.professional,
    necesidad: c.need,
    necesidadLegible: ETIQUETAS_NECESIDAD[c.need] ?? c.need,
    notas: c.notes,
    pregunta: c.questionForGroup,
    sesionesAlPedirlo: c.sessionsAtCheckIn,
    fecha: c.createdAt,
  }
}

function vistaSesion(s) {
  return {
    id: s.id,
    facilitador: s.facilitator,
    inicio: s.startsAt,
    fin: s.endsAt,
    enlace: s.meetingUrl,
    agenda: s.agenda,
    estado: s.status,
    invitados: s.invitations.map((i) => ({
      id: i.professional.id,
      nombre: i.professional.fullName,
      asistio: i.attended,
    })),
    creadaPor: s.createdByEmail,
    creadaEl: s.createdAt,
  }
}

// ── La sesión grupal: una máquina de estados chica, con la misma disciplina ──

const TRANSICIONES_GRUPAL = {
  PROGRAMADA: ['REALIZADA', 'CANCELADA'],
  REALIZADA: [],
  CANCELADA: [],
}

const ETIQUETAS_GRUPAL = {
  PROGRAMADA: 'programada',
  REALIZADA: 'realizada',
  CANCELADA: 'cancelada',
}

/** Regla 3 del MAPA: un estado se cambia exigiendo la transición, no con un update suelto. */
export function exigirTransicionGrupal(desde, hacia) {
  if (desde === hacia) {
    throw new DomainError('TRANSICION_INVALIDA', `La sesión ya está ${ETIQUETAS_GRUPAL[hacia] ?? hacia}`, {
      actual: desde,
    })
  }
  const permitidas = TRANSICIONES_GRUPAL[desde] ?? []
  if (!permitidas.includes(hacia)) {
    throw new DomainError(
      'TRANSICION_INVALIDA',
      permitidas.length
        ? `Una sesión ${ETIQUETAS_GRUPAL[desde]} solo puede pasar a: ${permitidas.map((e) => ETIQUETAS_GRUPAL[e]).join(', ')}`
        : `Una sesión ${ETIQUETAS_GRUPAL[desde]} ya no se puede cambiar`,
      { actual: desde, permitidas },
    )
  }
}

/**
 * La agenda con la que llega la sesión, armada de lo que pidieron los
 * invitados. Una línea por persona: quién, qué necesita y, si la dejó, su
 * pregunta. Coordinación la puede editar antes de convocar.
 */
export function armarAgenda(checkIns) {
  const lineas = checkIns.map((c) => {
    const nombre = c.professional?.fullName ?? 'Alguien del equipo'
    const que = ETIQUETAS_NECESIDAD[c.need] ?? c.need
    return c.questionForGroup ? `— ${nombre} (${que}): ${c.questionForGroup}` : `— ${nombre}: ${que}.`
  })
  return lineas.length ? lineas.join('\n') : null
}

/**
 * Convocar. Crea la sesión, invita, y deja cada check-in pendiente de los
 * invitados apuntando a esta sesión —así deja de aparecer como pendiente y
 * queda el rastro de por qué se le invitó—. Todo o nada.
 */
export async function convocarSesionGrupal({
  facilitatorId,
  startsAt,
  duracionMinutos = 60,
  meetingUrl,
  invitados,
  agenda,
  createdByEmail,
}) {
  const inicio = new Date(startsAt)
  if (Number.isNaN(inicio.getTime())) throw new DomainError('FECHA_INVALIDA', 'La fecha y hora no son válidas')
  if (inicio <= new Date()) throw new DomainError('FECHA_PASADA', 'La sesión tiene que ser más adelante')
  const fin = new Date(inicio.getTime() + duracionMinutos * 60000)

  const facilitador = await prisma.professional.findFirst({
    where: {
      id: facilitatorId,
      supervisorVolunteer: true,
      status: 'ACTIVO',
      deletedAt: null,
      professionalCardVerified: true,
    },
    select: { id: true, fullName: true, email: true },
  })
  if (!facilitador) {
    throw new DomainError(
      'FACILITADOR_NO_DISPONIBLE',
      'Esa persona no está ofrecida como supervisor, no está activa, o no tiene la tarjeta verificada',
    )
  }

  // Sin duplicados, y sin invitar al facilitador a su propia sesión.
  const ids = [...new Set(invitados)].filter((id) => id !== facilitatorId)
  if (ids.length === 0) throw new DomainError('SIN_INVITADOS', 'Invita al menos a una persona distinta del facilitador')

  const profesionales = await prisma.professional.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, fullName: true, email: true },
  })
  if (profesionales.length !== ids.length) {
    throw new DomainError('INVITADO_NO_ENCONTRADO', 'Alguno de los invitados ya no está en la red')
  }

  const pendientes = await prisma.professionalCheckIn.findMany({
    where: { professionalId: { in: ids }, groupSessionId: null },
    orderBy: { createdAt: 'asc' },
    include: { professional: { select: { fullName: true } } },
  })

  const sesion = await prisma.$transaction(async (tx) => {
    const creada = await tx.supportGroupSession.create({
      data: {
        facilitatorId,
        startsAt: inicio,
        endsAt: fin,
        meetingUrl: meetingUrl.trim(),
        agenda: agenda?.trim() ? agenda.trim() : armarAgenda(pendientes),
        createdByEmail: createdByEmail ?? null,
        invitations: { create: ids.map((professionalId) => ({ professionalId })) },
      },
    })
    if (pendientes.length) {
      await tx.professionalCheckIn.updateMany({
        where: { id: { in: pendientes.map((p) => p.id) } },
        data: { groupSessionId: creada.id },
      })
    }
    return creada
  })

  return { sesion, facilitador, invitados: profesionales }
}

export async function cambiarEstadoSesionGrupal(id, hacia) {
  const actual = await prisma.supportGroupSession.findUnique({ where: { id }, select: { status: true } })
  if (!actual) throw new DomainError('NO_ENCONTRADO', 'La sesión no existe')
  exigirTransicionGrupal(actual.status, hacia)
  return prisma.supportGroupSession.update({ where: { id }, data: { status: hacia } })
}

/** Después de la sesión: quién estuvo. Los no listados quedan como ausentes. */
export async function marcarAsistencia(id, asistieron) {
  const sesion = await prisma.supportGroupSession.findUnique({ where: { id }, select: { id: true } })
  if (!sesion) throw new DomainError('NO_ENCONTRADO', 'La sesión no existe')
  const presentes = new Set(asistieron)
  const invitaciones = await prisma.supportGroupInvitation.findMany({ where: { sessionId: id } })
  await prisma.$transaction(
    invitaciones.map((i) =>
      prisma.supportGroupInvitation.update({
        where: { id: i.id },
        data: { attended: presentes.has(i.professionalId) },
      }),
    ),
  )
  return invitaciones.length
}

/** Para el punto del menú: cuántos pidieron el espacio y nadie ha convocado. */
export function checkInsSinAtender() {
  return prisma.professionalCheckIn.count({
    where: { groupSessionId: null, professional: { deletedAt: null } },
  })
}

/**
 * Lo mismo que `sesionesHechasPor`, para todos a la vez: dos consultas en
 * total en vez de dos por profesional. Es lo que enseña la lista de
 * Profesionales, para saber de un vistazo a quién se le abre ya el espacio.
 * Devuelve una función, como `cargaActual`: `(id) => cuántas`.
 */
export async function sesionesHechasPorTodos() {
  const [citas, reportes] = await Promise.all([
    prisma.appointment.findMany({
      where: { patient: { deletedAt: null } },
      select: {
        id: true,
        professionalId: true,
        startsAt: true,
        status: true,
        caseAssignmentId: true,
        patientFirstJoinedAt: true,
        professionalFirstJoinedAt: true,
      },
    }),
    prisma.caseReport.findMany({
      select: { id: true, assignmentId: true, outcome: true, createdAt: true },
    }),
  ])
  const porProfesional = new Map()
  for (const c of citas) {
    if (!huboSesion(c, reportes, citas)) continue
    porProfesional.set(c.professionalId, (porProfesional.get(c.professionalId) ?? 0) + 1)
  }
  return (professionalId) => porProfesional.get(professionalId) ?? 0
}
