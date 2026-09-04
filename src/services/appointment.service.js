import crypto from 'crypto'
import { generarEnlaceVideollamada } from './meeting.service.js'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { ProfessionalModel } from '../models/professional.model.js'
import { PatientModel } from '../models/patient.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { DomainError } from '../errors/DomainError.js'
import { exigirTransicion, ESTADOS } from './appointmentState.service.js'
import { exigirTransicion as exigirTransicionAsignacion } from './assignmentState.service.js'
import {
  dentroDeDisponibilidad,
  franjasEnPalabras,
  DURACION_MINIMA,
  DESCANSO,
} from './scheduling.service.js'

/**
 * SERVICIO: citas.
 *
 * Aquí vive la lógica que cruza varios modelos. Los controladores no deben
 * hacer nada de esto: solo llamar y traducir el resultado.
 */

/**
 * Traduce el error de PostgreSQL a algo que una persona entienda.
 *
 * Llegan de dos formas distintas: las restricciones de exclusión salen como
 * error crudo con el nombre dentro del mensaje, y el índice único parcial sale
 * como `P2002` de Prisma con la columna en `meta.target`.
 */
function traducirChoque(error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const columnas = [].concat(error.meta?.target ?? []).join(',')
    if (columnas.includes('patient_id')) {
      return new DomainError(
        'YA_TIENE_PROFESIONAL',
        'Esa persona ya tiene un profesional asignado. Cierra la asignación actual antes de crear otra.',
      )
    }
  }

  const mensaje = String(error?.message ?? '')

  if (mensaje.includes('cita_sin_solape_profesional')) {
    return new DomainError(
      'FRANJA_OCUPADA',
      'Ese horario se acaba de ocupar, o choca con el descanso de otra sesión. Actualiza y elige otro.',
    )
  }
  if (mensaje.includes('cita_sin_solape_paciente')) {
    return new DomainError(
      'PACIENTE_OCUPADO',
      'Esa persona ya tiene otra cita a esa hora.',
    )
  }
  if (mensaje.includes('cita_duracion_minima')) {
    return new DomainError(
      'DURACION_INSUFICIENTE',
      `Una sesión dura al menos ${DURACION_MINIMA} minutos.`,
    )
  }
  if (mensaje.includes('un_profesional_activo_por_paciente')) {
    return new DomainError(
      'YA_TIENE_PROFESIONAL',
      'Esa persona ya tiene un profesional asignado. Cierra la asignación actual antes de crear otra.',
    )
  }
  return error
}

/**
 * Crea una cita.
 *
 * El orden de las comprobaciones importa: primero lo que se puede explicar bien
 * (persona inactiva, fuera de franja), y al final la base de datos, que es la
 * única que puede resolver dos agendadores simultáneos.
 */
export async function crearCita({
  professionalId,
  patientId,
  inicio,
  fin,
  modalidad,
  estado,
  status,
  descansoMinutos = DESCANSO,
  permitirFueraDeFranja = false,
  consentSigned,
  consentSignedDocumentUrl,
  consentSignedAt,
  /**
   * El enlace de reunión que alguien escribió a mano, si lo hay.
   *
   * `reprogramar`, `confirmarHorario` y el modal de agendar llevaban años
   * pasándolos aquí, y esta función no los destructuraba ni los escribía: se
   * caían en silencio. Es la causa de que las citas virtuales quedaran con
   * `meetingUrl` nulo.
   *
   * Ojo con la regla que ya costó salas vacías: NADIE deriva el nombre de una
   * sala por su cuenta. Esto no lo deriva — guarda el que le dieron, que es
   * distinto: sirve para pegar un Meet o un Zoom propio cuando hace falta. La
   * sala de la red se sigue firmando en `meeting.service.js` y no pasa por
   * aquí.
   */
  meetingUrl,
  meetingProvider,
  actorId,
}) {
  const [profesional, paciente] = await Promise.all([
    ProfessionalModel.findById(professionalId),
    PatientModel.findById(patientId),
  ])

  if (!profesional) throw new DomainError('NO_ENCONTRADO', 'El profesional no existe')
  if (!paciente) throw new DomainError('NO_ENCONTRADO', 'La persona no existe')

  if (profesional.status !== 'ACTIVO') {
    throw new DomainError(
      'PROFESIONAL_NO_ACTIVO',
      `${profesional.fullName} no está recibiendo casos en este momento.`,
    )
  }

  if (inicio <= new Date()) {
    throw new DomainError('EN_EL_PASADO', 'No se pueden agendar citas en el pasado.')
  }

  const duracion = (fin - inicio) / 60000
  if (duracion < DURACION_MINIMA) {
    throw new DomainError(
      'DURACION_INSUFICIENTE',
      `Una sesión dura al menos ${DURACION_MINIMA} minutos.`,
    )
  }

  const disponibilidad = await dentroDeDisponibilidad({ professionalId, inicio, fin })

  // Si ya existe una asignación activa, la cita cuelga de ella.
  const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(patientId)

  /**
   * Un BLOQUEO no se salta nunca: si dijo «estas dos semanas no estoy», no
   * está. La franja de su agenda sí se puede saltar, pero solo si quien
   * coordina lo marca a mano, porque el profesional aceptó ESE horario
   * concreto por fuera de lo que tenía declarado.
   *
   * Aquí había una segunda vía: que el horario cayera en los días y franjas
   * que el profesional escribía al aceptar el caso. Se fue con esos campos.
   * Ahora su agenda es la única fuente de cuándo puede —y es también de donde
   * elige la persona—, así que ya no hay dos listas de horarios capaces de
   * contradecirse. Antes podían: el error llegó a decir «lunes» cuando para
   * ese caso él había dicho «miércoles».
   */
  const saltable = permitirFueraDeFranja && disponibilidad.motivo === 'FUERA_DE_FRANJA'

  if (!disponibilidad.cabe && !saltable) {
    if (disponibilidad.motivo === 'BLOQUEO') {
      throw new DomainError(
        'BLOQUEO_DE_AGENDA',
        `${profesional.fullName} tiene ese rato bloqueado en su agenda.`,
      )
    }

    const franjas = await franjasEnPalabras(professionalId)
    throw new DomainError(
      'FUERA_DE_FRANJA',
      franjas
        ? `Ese horario está por fuera de la agenda de ${profesional.fullName} (declaró: ${franjas}).`
        : `Ese horario está por fuera de la agenda de ${profesional.fullName}, que no tiene franjas cargadas.`,
    )
  }

  // Si la persona ya había firmado el consentimiento informado en una cita previa o en este caso,
  // no es necesario volver a pedirle la firma: se hereda automáticamente.
  let yaFirmoConsentimiento = Boolean(consentSigned)
  let urlDocConsentimiento = consentSignedDocumentUrl ?? null
  let fechaFirmaConsentimiento = consentSignedAt ?? null

  if (!yaFirmoConsentimiento) {
    const previaConConsentimiento = await prisma.appointment.findFirst({
      where: {
        patientId,
        consentSigned: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    if (previaConConsentimiento) {
      yaFirmoConsentimiento = true
      urlDocConsentimiento = previaConConsentimiento.consentSignedDocumentUrl
      fechaFirmaConsentimiento = previaConConsentimiento.consentSignedAt
    }
  }

  try {
    const cita = await AppointmentModel.create({
      professionalId,
      patientId,
      caseAssignmentId: asignacion?.id ?? null,
      startsAt: inicio,
      endsAt: fin,
      bufferMinutes: descansoMinutos,
      modality: modalidad ?? profesional.modality,
      status: estado ?? status ?? 'PROGRAMADA',
      consentSigned: yaFirmoConsentimiento,
      consentSignedDocumentUrl: urlDocConsentimiento,
      consentSignedAt: fechaFirmaConsentimiento,
      // El formulario manda cadena vacía cuando el campo se deja en blanco.
      meetingUrl: meetingUrl?.trim() ? meetingUrl.trim() : null,
      meetingProvider: meetingProvider?.trim() ? meetingProvider.trim() : null,
      createdById: actorId ?? null,
    })

    if (paciente.status === 'NUEVO' || paciente.status === 'EN_ADMISION') {
      await PatientModel.update(patientId, { status: 'EN_ACOMPANAMIENTO' })
    }

    /**
     * Si ya hay sesión, el caso está ACTIVO. Lo diga quien lo diga.
     *
     * `activar()` se llamaba desde un solo sitio: `confirmarHorario`, que es
     * por donde entra la persona con su enlace. La otra puerta —«Ya me
     * confirmó: agendar», cuando ella responde por WhatsApp y coordinación
     * transcribe la hora— pasa por aquí y no activaba nada. La asignación se
     * quedaba en ACEPTADA con una cita confirmada colgando.
     *
     * No era solo una etiqueta mal puesta. El barrido libera las ACEPTADA
     * cuyo `respondedAt` pase del plazo, y ese campo se escribe al asignar:
     * tres días después, el sistema cancelaba la asignación Y su sesión ya
     * agendada, devolvía a la persona a la cola y le escribía a coordinación
     * diciendo que nadie había agendado. Alguien había agendado, y desde el
     * propio portal.
     *
     * Solo se activa desde ACEPTADA: reprogramar y las sesiones siguientes
     * entran con el caso ya ACTIVO, y volver a llamar aquí les movería
     * `startedAt`, que es cuándo empezó el acompañamiento y no cuándo se
     * agendó la última cita.
     */
    if (asignacion?.status === 'ACEPTADA') {
      await CaseAssignmentModel.activar(asignacion.id)
    }

    return cita
  } catch (error) {
    throw traducirChoque(error)
  }
}

/** Cambia el estado de una cita respetando la máquina de estados. */
export async function cambiarEstado({ citaId, nuevoEstado, motivo, actorId }) {
  const cita = await AppointmentModel.findById(citaId)
  if (!cita) throw new DomainError('NO_ENCONTRADO', 'La cita no existe')

  exigirTransicion(cita.status, nuevoEstado)

  if (nuevoEstado === ESTADOS.CANCELADA && !motivo?.trim()) {
    throw new DomainError('TRANSICION_INVALIDA', 'Cancelar una cita requiere un motivo.')
  }

  return AppointmentModel.update(citaId, {
    status: nuevoEstado,
    ...(nuevoEstado === ESTADOS.CANCELADA
      ? { cancelReason: motivo.trim(), cancelledById: actorId ?? null }
      : {}),
  })
}

/**
 * Reprograma: no edita la cita, crea otra y las enlaza.
 * Así el historial no se pierde y se puede ver cuántas veces se movió un caso.
 */
export async function reprogramar({ citaId, inicio, fin, modalidad, meetingUrl, meetingProvider, actorId }) {
  const original = await AppointmentModel.findById(citaId)
  if (!original) throw new DomainError('NO_ENCONTRADO', 'La cita no existe')

  exigirTransicion(original.status, ESTADOS.REPROGRAMADA)

  return prisma.$transaction(async () => {
    // Primero se libera la franja vieja: si no, la cita nueva chocaría consigo
    // misma cuando se mueve solo unos minutos.
    await AppointmentModel.update(citaId, { status: ESTADOS.REPROGRAMADA })

    let nueva
    try {
      nueva = await crearCita({
        professionalId: original.professionalId,
        patientId: original.patientId,
        inicio,
        fin,
        modalidad: modalidad ?? original.modality,
        descansoMinutos: original.bufferMinutes,
        consentSigned: original.consentSigned,
        consentSignedDocumentUrl: original.consentSignedDocumentUrl,
        consentSignedAt: original.consentSignedAt,
        meetingUrl: meetingUrl ?? (original.modality === 'VIRTUAL' ? original.meetingUrl : null),
        meetingProvider: meetingProvider ?? original.meetingProvider,
        actorId,
      })
    } catch (error) {
      // La transacción revierte el cambio de estado, así que la cita original
      // se queda como estaba.
      throw error
    }

    await AppointmentModel.update(citaId, { rescheduledToId: nueva.id })
    return nueva
  }, { timeout: 15000 })
}

/**
 * Le ASIGNA un caso a un profesional.
 *
 * El nombre se quedó de cuando esto proponía de verdad. Nació creando la
 * asignación en ACTIVA, como si aceptar fuera automático; luego pasó a
 * PROPUESTA, a esperar un sí — y siete de cada ocho no llegaron. Hoy nace en
 * ACEPTADA: se le asigna, se le avisa, y si no puede lo dice desde su enlace.
 * Ver el comentario largo dentro de la función.
 *
 * Aquí no sale ningún mensaje. El aviso al profesional lo manda quien coordina
 * desde la ficha de la persona (paso 3, plantilla WHATSAPP_PROPUESTA_PROFESIONAL),
 * y es el único sitio por el que le llega el enlace con el que puede declinar.
 */
export async function proponerCaso({ professionalId, patientId, actorId }) {
  const [profesional, paciente] = await Promise.all([
    ProfessionalModel.findById(professionalId),
    PatientModel.findById(patientId),
  ])

  if (!profesional) throw new DomainError('NO_ENCONTRADO', 'El profesional no existe')
  if (!paciente) throw new DomainError('NO_ENCONTRADO', 'La persona no existe')

  if (profesional.status !== 'ACTIVO') {
    throw new DomainError(
      'PROFESIONAL_NO_ACTIVO',
      `${profesional.fullName} no está recibiendo casos en este momento.`,
    )
  }

  const activas = await CaseAssignmentModel.contarActivas(professionalId)
  if (activas >= profesional.maxActiveCases) {
    throw new DomainError(
      'SIN_CUPO',
      `${profesional.fullName} ya lleva ${activas} de ${profesional.maxActiveCases} casos.`,
    )
  }

  /**
   * Agenda cargada. La otra mitad de lo que hace justo asignar sin preguntar.
   *
   * El comentario de abajo lleva desde el cambio de flujo diciendo que «solo se
   * asigna a quien tiene agenda cargada y cupo libre — las dos condiciones ya
   * se comprueban arriba». El cupo sí; la agenda no se comprobaba en ningún
   * sitio. Y sin agenda no hay nada que asignar: el paso siguiente le manda a
   * la persona un enlace para que elija hora «entre los espacios que él ya
   * tiene marcados como libres», y esa pantalla le sale vacía. Nadie está
   * esperando respuesta, así que el caso se para sin que salte nada.
   *
   * Se cuentan las REGLAS, no los huecos: quien tiene la agenda llena las dos
   * próximas semanas sí está disponible, solo que más tarde. Lo que no puede
   * pasar es asignarle a quien no ha declarado ni una franja.
   */
  const franjas = await prisma.availabilityRule.count({ where: { professionalId } })
  if (franjas === 0) {
    throw new DomainError(
      'SIN_AGENDA',
      `${profesional.fullName} no tiene franjas de disponibilidad cargadas, así que la persona no tendría dónde elegir hora. Cárgale la agenda antes de asignarle el caso.`,
    )
  }

  try {
    /**
     * Se asigna. No se pide permiso.
     *
     * Antes esto nacía en PROPUESTA y ahí se quedaba hasta que el profesional
     * dijera que sí. Los datos contaron lo que costaba: de las ocho
     * asignaciones que se hicieron para una persona con prioridad ALTA, siete
     * murieron con el motivo «el profesional no respondió». Siete de los ocho
     * cierres de toda la base son por silencio.
     *
     * El profesional ya se registró, ya cargó su agenda y ya dijo cuántos
     * casos puede llevar. Volver a preguntarle caso por caso no le da más
     * margen a él: deja el caso parado. Ahora queda asignado y se le avisa; si
     * no puede, lo dice desde su enlace y se reasigna al instante.
     *
     * Lo que cambia de fondo es qué significa el silencio. Antes detenía el
     * caso; ahora deja que siga. Y eso solo es justo si declinar cuesta un
     * toque y si únicamente se asigna a quien tiene agenda cargada y cupo
     * libre — las dos condiciones ya se comprueban arriba.
     */
    const asignacion = await CaseAssignmentModel.create({
      professionalId,
      patientId,
      createdById: actorId ?? null,
      status: 'ACEPTADA',
      respondedAt: new Date(),
    })

    return asignacion
  } catch (error) {
    throw traducirChoque(error)
  }
}

/** Cierra la asignación y, con ella, el caso. */
export async function cerrarCaso({ asignacionId, motivo }) {
  const asignacion = await CaseAssignmentModel.findById(asignacionId)
  if (!asignacion) throw new DomainError('NO_ENCONTRADO', 'La asignación no existe')
  if (asignacion.status === 'CERRADA') {
    throw new DomainError('TRANSICION_INVALIDA', 'Ese caso ya está cerrado')
  }

  /**
   * Por la máquina de estados, como todo lo demás.
   *
   * Esto hacía un `update` directo y solo miraba que no estuviera ya cerrada.
   * Por API se podía cerrar desde ACEPTADA, CANCELADA o RECHAZADA —las tres
   * prohibidas en `TRANSICIONES`— y el único freno era que el botón solo se
   * pintara sobre casos activos. Es la regla 3 del proyecto: un estado se
   * cambia con `exigirTransicion()`, nunca con un update a mano.
   *
   * El «ya está cerrado» de arriba se queda porque dice algo más útil que un
   * TRANSICION_INVALIDA genérico, y es el caso que de verdad se repite.
   */
  exigirTransicionAsignacion(asignacion.status, 'CERRADA')

  const cerrada = await CaseAssignmentModel.cerrar(asignacionId, motivo)

  /**
   * Y las sesiones que quedaban por delante se cancelan.
   *
   * Cancelar una asignación sí lo hacía; cerrarla no, y la diferencia no la
   * justificaba nada. Una cita confirmada sobrevivía al cierre: seguía
   * ocupando la agenda del profesional, seguía disparando su recordatorio y su
   * petición de reporte, y seguía abriendo una sala a la que la persona podía
   * entrar — mientras su ficha ya decía CERRADO y había salido del tablero.
   */
  await prisma.appointment.updateMany({
    // Persona + profesional, por lo mismo que en `cancelarAsignacion`: una
    // cita sin `caseAssignmentId` es igual de real que las demás.
    where: {
      patientId: asignacion.patientId,
      professionalId: asignacion.professionalId,
      status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
    },
    data: {
      status: 'CANCELADA',
      cancelReason: motivo
        ? `El acompañamiento se cerró: ${motivo}`
        : 'El acompañamiento se cerró.',
    },
  })

  await PatientModel.update(asignacion.patientId, { status: 'CERRADO' })
  return cerrada
}


/**
 * La persona acompañada eligió horario: se agenda y el caso arranca.
 *
 * Este es el paso que faltaba. `POST /api/appointments` existía, estaba
 * probado, y no lo llamaba ninguna pantalla: no había forma de crear una cita
 * desde el portal. Aquí encaja de forma natural, porque cuadrar el horario y
 * agendar son el mismo gesto.
 */
export async function confirmarHorario({
  asignacionId,
  inicio,
  fin,
  modalidad,
  fueraDeFranja = false,
  meetingUrl,
  meetingProvider,
  actorId,
  estado = ESTADOS.CONFIRMADA,
}) {
  const asignacion = await CaseAssignmentModel.findById(asignacionId)
  if (!asignacion) throw new DomainError('NO_ENCONTRADO', 'La asignación no existe')

  exigirTransicionAsignacion(asignacion.status, 'ACTIVA')

  return prisma.$transaction(async () => {
    const cita = await crearCita({
      professionalId: asignacion.professionalId,
      patientId: asignacion.patientId,
      inicio,
      fin,
      modalidad,
      /**
       * Nace CONFIRMADA, no PROGRAMADA.
       *
       * Por aqui solo se pasa cuando la hora la eligio la persona: desde su
       * enlace, o cuando quien coordina registra la que ella dijo por
       * WhatsApp. No queda nadie a quien preguntarle si le sirve — ella es
       * quien lo dijo.
       *
       * Naciendo PROGRAMADA, el camino con la prueba mas fuerte producia el
       * estado mas debil: la pantalla ofrecia «Confirmar Cita» sobre una hora
       * que la persona ya habia escogido, el tablero la contaba como
       * propuesta, y el paso 5 decia «sin confirmar todavia». Trabajo que no
       * existe, tres veces.
       */
      estado,
      // El profesional acepto ESTE horario desde su enlace. Su palabra de hoy
      // vale mas que las franjas que declaro hace un mes; quien coordina tiene
      // que marcarlo a mano y queda en la auditoria.
      permitirFueraDeFranja: fueraDeFranja,
      meetingUrl,
      meetingProvider,
      actorId,
    })

    await CaseAssignmentModel.activar(asignacionId)
    await PatientModel.update(asignacion.patientId, { status: 'EN_ACOMPANAMIENTO' })

    return { cita, asignacion }
  })
}

/**
 * El caso vuelve a la cola, por una de dos razones distintas.
 *
 * `comoRechazo` escribe RECHAZADA —«este profesional no podía»— en vez de
 * CANCELADA —«no se pudo cuadrar»—. Solo es legal desde los estados en que él
 * todavía no ha empezado; con sesión de por medio, la salida es CANCELADA y la
 * máquina de estados lo impone.
 */
export async function cancelarAsignacion({ asignacionId, motivo, comoRechazo = false }) {
  const asignacion = await CaseAssignmentModel.findById(asignacionId)
  if (!asignacion) throw new DomainError('NO_ENCONTRADO', 'La asignación no existe')

  const destino = comoRechazo ? 'RECHAZADA' : 'CANCELADA'
  exigirTransicionAsignacion(asignacion.status, destino)

  // `responder` es el mismo camino que usa el profesional desde su enlace: deja
  // el motivo en `declineReason`, que es donde se lee «por qué no pudo».
  const cancelada = comoRechazo
    ? await CaseAssignmentModel.responder(asignacionId, { acepta: false, motivo })
    : await CaseAssignmentModel.cancelar(asignacionId, motivo)

  /**
   * Las sesiones vivas con ese profesional se cancelan. Todas, no solo las
   * que quedaron enlazadas.
   *
   * Esto filtraba por `caseAssignmentId`, y una cita creada cuando no había
   * asignación abierta lo lleva nulo: sobrevivía a la reasignación con el
   * profesional anterior, ocupando su agenda, disparando su recordatorio y
   * abriendo una sala para una pareja que ya no existe.
   *
   * Persona + profesional es la condición que de verdad describe «las sesiones
   * de este acompañamiento», y no depende de que el enlace se escribiera bien
   * en su momento.
   */
  await prisma.appointment.updateMany({
    where: {
      patientId: asignacion.patientId,
      professionalId: asignacion.professionalId,
      status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
    },
    data: {
      status: 'CANCELADA',
      cancelReason: `Caso reasignado / asignación cancelada: ${motivo}`,
    },
  })

  await devolverALaCola(asignacion.patientId)
  return cancelada
}

/**
 * La persona vuelve a «Por asignar».
 *
 * Vive aquí y no dentro de cancelar porque un acompañamiento puede romperse por
 * dos caminos distintos —se cancela, o el profesional declina— y los dos tienen
 * que dejarla igual de visible. Solo lo hacía cancelar, así que declinar la
 * dejaba sin profesional y fuera de la lista a la vez: nadie la ve esperando
 * porque el tablero cree que está acompañada.
 *
 * Es la peor forma de perder a alguien. No falla nada, no salta ningún aviso, y
 * la persona que pidió ayuda simplemente deja de aparecer.
 */
export async function devolverALaCola(patientId) {
  await PatientModel.update(patientId, { status: 'EN_ADMISION' })
}
