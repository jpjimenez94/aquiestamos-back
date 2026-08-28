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
    // Solo la URL que de verdad esté guardada. Antes, si no había ninguna,
    // aquí se inventaba `https://meet.jit.si/AquiEstamos-Sesion-<uuid>`, y esa
    // sala NO era la sala: el nombre real lo deriva `generarEnlaceVideollamada`
    // a partir del secreto, y nunca coincidió con este invento. El resultado
    // es que el profesional entraba por «Mi agenda» a una sala vacía mientras
    // la persona esperaba en otra. Las 19 citas virtuales de producción tenían
    // todas `meetingUrl` en null, así que el invento era el único camino, no
    // un caso raro.
    //
    // Ahora esto dice la verdad —null si no hay— y quien quiera entrar pasa
    // por `/sala/<token>`, que es la única puerta y además deja telemetría.
    meetingUrl: c.meetingUrl ?? null,
    meetingProvider: c.meetingProvider ?? (c.modality === 'VIRTUAL' ? 'JITSI' : null),
    // Llaves de sala FIRMADAS, una por rol.
    //
    // Aquí salía `c.id`: el UUID de la cita, sin firma. `generarTokenSala`
    // estaba importado pero no se llamaba desde ningún sitio, así que toda la
    // capa HMAC era decorativa y cualquiera con el UUID entraba a la sala —y
    // el rol lo elegía el propio cliente por query string. Ahora el rol viaja
    // sellado dentro del token y el servidor no acepta que se lo contradigan.
    salaTokenPaciente:
      c.meetingUrl || c.modality === 'VIRTUAL' ? generarTokenSala(c.id, 'PACIENTE') : null,
    salaTokenProfesional:
      c.meetingUrl || c.modality === 'VIRTUAL' ? generarTokenSala(c.id, 'PROFESIONAL') : null,
    patientFirstJoinedAt: c.patientFirstJoinedAt ?? null,
    professionalFirstJoinedAt: c.professionalFirstJoinedAt ?? null,
    totalCallDurationSeconds: c.totalCallDurationSeconds ?? 0,
    totalCallDurationMinutes: c.totalCallDurationSeconds ? Math.round(c.totalCallDurationSeconds / 60) : 0,
    accessLogs: c.accessLogs ?? [],
    ...(() => {
      const ahora = Date.now()

      /**
       * Cuánto silencio se tolera antes de dar a alguien por desconectado.
       *
       * Eran 60 segundos, con el latido cada 20: parecía sobrado, pero la sala
       * de Jitsi se abre en otra pestaña —embebida la corta a los cinco
       * minutos— y con esta de fondo el navegador estrangula los temporizadores
       * a uno por minuto. El latido llegaba justo en el filo y el semáforo se
       * apagaba y encendía con las dos personas dentro.
       *
       * Tres minutos deja pasar dos latidos estrangulados seguidos antes de
       * decir que alguien se fue. Es tolerante a propósito: decir «no está» de
       * quien sí está manda a coordinación a perseguir a alguien que ya se
       * conectó, y ese error cuesta más que tardar un minuto en notar una
       * salida real.
       */
      const VENTANA_EN_VIVO_MS = 3 * 60 * 1000
      const desdeCuandoCuenta = ahora - VENTANA_EN_VIVO_MS
      const logs = c.accessLogs ?? []
      const pacienteLog = logs.find((l) => l.role === 'PACIENTE')
      const profesionalLog = logs.find((l) => l.role === 'PROFESIONAL')

      const pacienteEnVivo = pacienteLog ? new Date(pacienteLog.lastPingAt).getTime() > desdeCuandoCuenta : false
      const profesionalEnVivo = profesionalLog ? new Date(profesionalLog.lastPingAt).getTime() > desdeCuandoCuenta : false
      const llamadaEnVivo = pacienteEnVivo || profesionalEnVivo
      const ambosEnVivo = pacienteEnVivo && profesionalEnVivo

      const pacienteSegundosDesdePing = pacienteLog ? Math.max(0, Math.round((ahora - new Date(pacienteLog.lastPingAt).getTime()) / 1000)) : null
      const profesionalSegundosDesdePing = profesionalLog ? Math.max(0, Math.round((ahora - new Date(profesionalLog.lastPingAt).getTime()) / 1000)) : null

      return {
        pacienteEnVivo,
        profesionalEnVivo,
        llamadaEnVivo,
        ambosEnVivo,
        pacienteSegundosDesdePing,
        profesionalSegundosDesdePing,
        pacienteUltimoPing: pacienteLog?.lastPingAt ?? null,
        profesionalUltimoPing: profesionalLog?.lastPingAt ?? null,
      }
    })(),
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
