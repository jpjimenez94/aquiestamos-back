import { ETIQUETAS } from '../services/appointmentState.service.js'
import { formatearLocal, franjaDe } from '../services/timezone.service.js'
import { transicionesDesde } from '../services/appointmentState.service.js'
import { generarTokenSala } from '../services/meeting.service.js'

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
    meetingUrl: c.meetingUrl ?? (c.modality === 'VIRTUAL' ? `https://meet.jit.si/AquiEstamos-Sesion-${c.id}` : null),
    meetingProvider: c.meetingProvider ?? (c.modality === 'VIRTUAL' ? 'JITSI' : null),
    salaTokenPaciente: (c.meetingUrl || c.modality === 'VIRTUAL') ? c.id : null,
    salaTokenProfesional: (c.meetingUrl || c.modality === 'VIRTUAL') ? c.id : null,
    patientFirstJoinedAt: c.patientFirstJoinedAt ?? null,
    professionalFirstJoinedAt: c.professionalFirstJoinedAt ?? null,
    totalCallDurationSeconds: c.totalCallDurationSeconds ?? 0,
    totalCallDurationMinutes: c.totalCallDurationSeconds ? Math.round(c.totalCallDurationSeconds / 60) : 0,
    accessLogs: c.accessLogs ?? [],
    estado: c.status,
    estadoLegible: ETIQUETAS[c.status] ?? c.status,
    siguientesEstados: transicionesDesde(c.status),
    consentSigned: c.consentSigned ?? false,
    consentSignedDocumentUrl: c.consentSignedDocumentUrl,
    consentSignedAt: c.consentSignedAt,
    motivoCancelacion: c.cancelReason,
    reprogramadaA: c.rescheduledToId,
    profesional: c.professional
      ? {
          id: c.professional.id,
          nombre: c.professional.fullName,
          telefono: c.professional.phone,
          professionalCardVerified: c.professional.professionalCardVerified ?? false,
          professionalCardNumber: c.professional.professionalCardNumber ?? null,
          professionalCardDocumentUrl: c.professional.professionalCardDocumentUrl ?? null,
        }
      : { id: c.professionalId },
    paciente: c.patient
      ? {
          id: c.patient.id,
          nombre: c.patient.fullName,
          telefono: c.patient.phone,
          esMenor: c.patient.isMinor,
          canalPreferido: c.patient.preferredContact ?? null,
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
    meetingUrl: base.meetingUrl,
    meetingProvider: base.meetingProvider,
    salaTokenProfesional: base.salaTokenProfesional,
    estado: base.estado,
    estadoLegible: base.estadoLegible,
    paciente: base.paciente,
  }
}

export function citaListaParaProfesional(lista) {
  return lista.map(citaParaProfesional)
}
