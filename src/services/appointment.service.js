import { Prisma } from '@prisma/client'
import { prisma } from '../config/database.js'
import { AppointmentModel } from '../models/appointment.model.js'
import { ProfessionalModel } from '../models/professional.model.js'
import { PatientModel } from '../models/patient.model.js'
import { CaseAssignmentModel } from '../models/caseAssignment.model.js'
import { DomainError } from '../errors/DomainError.js'
import { exigirTransicion, ESTADOS } from './appointmentState.service.js'
import { dentroDeDisponibilidad, DURACION_MINIMA, DESCANSO } from './scheduling.service.js'

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
  if (!disponibilidad.cabe) {
    throw new DomainError(
      disponibilidad.motivo === 'BLOQUEO' ? 'BLOQUEO_DE_AGENDA' : 'FUERA_DE_FRANJA',
      disponibilidad.motivo === 'BLOQUEO'
        ? `${profesional.fullName} tiene ese rato bloqueado en su agenda.`
        : `Ese horario está fuera de las franjas que declaró ${profesional.fullName}.`,
    )
  }

  // Si ya existe una asignación activa, la cita cuelga de ella.
  const asignacion = await CaseAssignmentModel.findActivaDePaciente(patientId)

  try {
    const cita = await AppointmentModel.create({
      professionalId,
      patientId,
      caseAssignmentId: asignacion?.id ?? null,
      startsAt: inicio,
      endsAt: fin,
      bufferMinutes: descansoMinutos,
      modality: modalidad ?? profesional.modality,
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

/** Asigna un profesional a una persona. Solo puede haber una asignación activa. */
export async function asignarCaso({ professionalId, patientId, actorId }) {
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

    await PatientModel.update(patientId, { status: 'ASIGNADO' })
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
