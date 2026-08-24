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
  dentroDeLoOfrecido,
  franjasEnPalabras,
  ofertaEnPalabras,
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
  descansoMinutos = DESCANSO,
  permitirFueraDeFranja = false,
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

  // Si ya existe una asignación activa, la cita cuelga de ella. Se busca
  // antes de validar porque trae la otra fuente de disponibilidad: lo que el
  // profesional ofreció PARA ESTE CASO desde su enlace.
  const asignacion = await CaseAssignmentModel.findAbiertaDePaciente(patientId)

  /**
   * Un BLOQUEO no se salta nunca: si dijo "estas dos semanas no estoy", no
   * está. La franja de su agenda de perfil sí se puede saltar, por dos vías:
   *
   * - El horario cae en lo que él ofreció para este caso. Eso no es saltarse
   *   nada: es su palabra más reciente, y frenar aquí sería pedirle permiso a
   *   quien coordina para hacer lo que el profesional ya autorizó.
   * - Quien coordina lo marca a mano, porque el profesional aceptó ese
   *   horario concreto por fuera de todo lo que había dicho.
   */
  const ofrecido =
    asignacion != null &&
    dentroDeLoOfrecido({
      dias: asignacion.acceptedDays ?? [],
      franjas: asignacion.acceptedSlots ?? [],
      inicio,
      fin,
    })

  const saltable =
    (permitirFueraDeFranja || ofrecido) && disponibilidad.motivo === 'FUERA_DE_FRANJA'

  if (!disponibilidad.cabe && !saltable) {
    if (disponibilidad.motivo === 'BLOQUEO') {
      throw new DomainError(
        'BLOQUEO_DE_AGENDA',
        `${profesional.fullName} tiene ese rato bloqueado en su agenda.`,
      )
    }

    /**
     * El error solo enseña lo que el profesional respondió al aceptar ESTE
     * caso: esa es su palabra para esta persona y el único dato contra el que
     * quien coordina debe cuadrar. Su agenda general de perfil no se mienta
     * aquí —puede estar vieja y mezclarla es lo que hacía que el error dijera
     * «lunes» cuando para este caso él dijo «miércoles»—. Solo cuando no hay
     * oferta (una cita sin negociación de por medio) se cae a la agenda,
     * porque no queda otra fuente.
     */
    const oferta = ofertaEnPalabras(asignacion?.acceptedDays, asignacion?.acceptedSlots)

    let mensaje
    if (oferta) {
      mensaje = `Ese horario no está en lo que ${profesional.fullName} ofreció para este caso. Ofreció: ${oferta}.`
    } else {
      const franjas = await franjasEnPalabras(professionalId)
      mensaje = franjas
        ? `Ese horario está por fuera de la agenda de ${profesional.fullName} (declaró: ${franjas}).`
        : `Ese horario está por fuera de la agenda de ${profesional.fullName}, que no tiene franjas cargadas.`
    }
    throw new DomainError('FUERA_DE_FRANJA', mensaje)
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
export async function reprogramar({ citaId, inicio, fin, modalidad, actorId }) {
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
        actorId,
      })
    } catch (error) {
      // La transacción revierte el cambio de estado, así que la cita original
      // se queda como estaba.
      throw error
    }

    await AppointmentModel.update(citaId, { rescheduledToId: nueva.id })
    return nueva
  })
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
    const asignacion = await CaseAssignmentModel.create({
      professionalId,
      patientId,
      createdById: actorId ?? null,
    })

    // El paciente NO pasa a ASIGNADO todavía: nadie ha aceptado nada. Decir
    // "asignado" en el tablero cuando solo hay una propuesta en el aire es
    // justo la mentira que este cambio viene a quitar.
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
      actorId,
    })

    await CaseAssignmentModel.activar(asignacionId)
    await PatientModel.update(asignacion.patientId, { status: 'EN_ACOMPANAMIENTO' })

    return { cita, asignacion }
  })
}

/** Aceptó, pero no hubo forma de cuadrar. El caso vuelve a la cola. */
export async function cancelarAsignacion({ asignacionId, motivo }) {
  const asignacion = await CaseAssignmentModel.findById(asignacionId)
  if (!asignacion) throw new DomainError('NO_ENCONTRADO', 'La asignación no existe')

  exigirTransicionAsignacion(asignacion.status, 'CANCELADA')

  const cancelada = await CaseAssignmentModel.cancelar(asignacionId, motivo)
  // Vuelve a estar disponible para que se le proponga a otro profesional.
  await PatientModel.update(asignacion.patientId, { status: 'EN_ADMISION' })
  return cancelada
}
