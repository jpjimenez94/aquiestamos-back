import { ETIQUETAS } from '../services/appointmentState.service.js'
import { formatearLocal, franjaDe } from '../services/timezone.service.js'
import { transicionesDesde } from '../services/appointmentState.service.js'

/**
 * VISTA: Appointment
 * Devuelve la hora en ISO (para el navegador) y ya formateada en hora de
 * Bogota, para que ninguna pantalla tenga que volver a convertirla.
 */
export function cita(c) {
  return {
    id: c.id,
    inicio: c.startsAt,
    fin: c.endsAt,
    inicioLocal: formatearLocal(c.startsAt),
    finLocal: formatearLocal(c.endsAt),
    franja: franjaDe(c.startsAt),
    duracionMinutos: Math.round((new Date(c.endsAt) - new Date(c.startsAt)) / 60000),
    descansoMinutos: c.bufferMinutes,
    ocupaHasta: c.blocksUntil,
    modalidad: c.modality,
    estado: c.status,
    estadoLegible: ETIQUETAS[c.status] ?? c.status,
    siguientesEstados: transicionesDesde(c.status),
    motivoCancelacion: c.cancelReason,
    reprogramadaA: c.rescheduledToId,
    profesional: c.professional
      ? { id: c.professional.id, nombre: c.professional.fullName, telefono: c.professional.phone }
      : { id: c.professionalId },
    paciente: c.patient
      ? {
          id: c.patient.id,
          nombre: c.patient.fullName,
          telefono: c.patient.phone,
          esMenor: c.patient.isMinor,
        }
      : { id: c.patientId },
  }
}

export function citaLista(lista) {
  return lista.map(cita)
}

/** Lo que ve el profesional en su propia agenda: sin datos de otros. */
export function citaParaProfesional(c) {
  const base = cita(c)
  return {
    id: base.id,
    inicio: base.inicio,
    fin: base.fin,
    inicioLocal: base.inicioLocal,
    finLocal: base.finLocal,
    modalidad: base.modalidad,
    estado: base.estado,
    estadoLegible: base.estadoLegible,
    paciente: base.paciente,
  }
}

export function citaListaParaProfesional(lista) {
  return lista.map(citaParaProfesional)
}
