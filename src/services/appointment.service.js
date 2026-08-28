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
      createdById: actorId ?? null,
    })

    if (paciente.status === 'NUEVO' || paciente.status === 'EN_ADMISION') {
      await PatientModel.update(patientId, { status: 'EN_ACOMPANAMIENTO' })
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
 * Le PROPONE un caso a un profesional.
 *
 * Antes esto creaba la asignación en ACTIVA y ahí terminaba, como si aceptar
 * fuera automático. No lo es: el profesional es voluntario y puede no poder.
 * Ahora nace como PROPUESTA y solo pasa a ACTIVA cuando él acepta y la persona
 * acompañada confirma un horario.
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

  const cerrada = await CaseAssignmentModel.cerrar(asignacionId, motivo)
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

/** Aceptó, pero no hubo forma de cuadrar o se debe reasignar. El caso vuelve a la cola. */
export async function cancelarAsignacion({ asignacionId, motivo }) {
  const asignacion = await CaseAssignmentModel.findById(asignacionId)
  if (!asignacion) throw new DomainError('NO_ENCONTRADO', 'La asignación no existe')

  exigirTransicionAsignacion(asignacion.status, 'CANCELADA')

  const cancelada = await CaseAssignmentModel.cancelar(asignacionId, motivo)

  // Si había citas programadas o confirmadas con el profesional anterior, se cancelan.
  await prisma.appointment.updateMany({
    where: {
      caseAssignmentId: asignacionId,
      status: { in: ['PROGRAMADA', 'CONFIRMADA'] },
    },
    data: {
      status: 'CANCELADA',
      cancelReason: `Caso reasignado / asignación cancelada: ${motivo}`,
    },
  })

  // Vuelve a estar disponible para que se le proponga a otro profesional.
  await PatientModel.update(asignacion.patientId, { status: 'EN_ADMISION' })
  return cancelada
}
