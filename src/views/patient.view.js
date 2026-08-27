import { ETIQUETAS_ESTADO_PACIENTE, ETIQUETAS_PRIORIDAD } from '../catalogos.js'
import { ETIQUETAS as ETIQUETAS_CITA } from '../services/appointmentState.service.js'
import { formatearLocal } from '../services/timezone.service.js'
import { generarTokenSala } from '../services/meeting.service.js'

/**
 * VISTA: Patient
 *
 * Quien agenda necesita saber que la persona existe y cuando puede. No necesita
 * su correo ni el detalle de quien la acompana en casa.
 */
export function pacienteParaAgendador(p) {
  const ultimaCita = p.appointments?.[0]
  const ultimaAsignacion = p.assignments?.[0]

  return {
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
    city: p.city,
    isMinor: p.isMinor,
    preferredContact: p.preferredContact,
    preferredModality: p.preferredModality,
    availableDays: p.availableDays,
    availableSlots: p.availableSlots,
    status: p.status,
    estadoLegible: ETIQUETAS_ESTADO_PACIENTE[p.status] ?? p.status,
    priority: p.priority,
    prioridadLegible: ETIQUETAS_PRIORIDAD[p.priority] ?? p.priority,
    createdAt: p.createdAt,
    diasEsperando: Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000),
    cita: ultimaCita
      ? {
          id: ultimaCita.id,
          inicio: ultimaCita.startsAt,
          fin: ultimaCita.endsAt,
          inicioLocal: formatearLocal(ultimaCita.startsAt),
          finLocal: formatearLocal(ultimaCita.endsAt),
          modalidad: ultimaCita.modality,
          // Solo la URL guardada de verdad; ver el comentario largo en
          // `appointment.view.js`. Para entrar se usa `/sala/<token>`.
          meetingUrl: ultimaCita.meetingUrl ?? null,
          // Llaves de sala firmadas por rol. Antes salía el UUID crudo de la
          // cita; ver el comentario en `appointment.view.js`.
          salaTokenProfesional:
            ultimaCita.meetingUrl || ultimaCita.modality === 'VIRTUAL'
              ? generarTokenSala(ultimaCita.id, 'PROFESIONAL')
              : null,
          salaTokenPaciente:
            ultimaCita.meetingUrl || ultimaCita.modality === 'VIRTUAL'
              ? generarTokenSala(ultimaCita.id, 'PACIENTE')
              : null,
          estado: ultimaCita.status,
          estadoLegible: ETIQUETAS_CITA[ultimaCita.status] ?? ultimaCita.status,
          profesional: ultimaCita.professional?.fullName ?? null,
          motivoCancelacion: ultimaCita.cancelReason ?? null,
        }
      : null,
    asignacion: ultimaAsignacion
      ? {
          id: ultimaAsignacion.id,
          desde: ultimaAsignacion.startedAt,
          estado: ultimaAsignacion.status,
          notaDisponibilidad: ultimaAsignacion.availabilityNote ?? null,
          motivoCierre: ultimaAsignacion.closeReason ?? null,
          profesional: {
            id: ultimaAsignacion.professional?.id,
            nombre: ultimaAsignacion.professional?.fullName,
            telefono: ultimaAsignacion.professional?.phone,
            email: ultimaAsignacion.professional?.email,
          },
        }
      : null,
    comentarios:
      ultimaCita?.notes ||
      ultimaAsignacion?.availabilityNote ||
      ultimaAsignacion?.closeReason ||
      null,
    notasSeguimiento:
      p.notes?.map((n) => ({
        id: n.id,
        nota: n.note,
        autor: n.authorName,
        email: n.authorEmail,
        fecha: n.createdAt,
        fechaLocal: formatearLocal(n.createdAt),
      })) ?? [],
    totalNotas: p.notes?.length ?? 0,
    ultimaNota: p.notes?.[0]
      ? {
          id: p.notes[0].id,
          nota: p.notes[0].note,
          autor: p.notes[0].authorName,
          fecha: p.notes[0].createdAt,
          fechaLocal: formatearLocal(p.notes[0].createdAt),
        }
      : null,
  }
}

export function pacienteAdmin(p) {
  return {
    ...pacienteParaAgendador(p),
    email: p.email,
    forWhom: p.forWhom,
    contactName: p.contactName,
    relationship: p.relationship,
    supportRequestId: p.supportRequestId,
  }
}

export function pacienteSegunRol(p, usuario) {
  return usuario?.role === 'ADMIN' ? pacienteAdmin(p) : pacienteParaAgendador(p)
}

export function pacienteLista(lista, usuario) {
  return lista.map((p) => pacienteSegunRol(p, usuario))
}

/**
 * VISTA: el caso tal como lo ve el profesional que entra por enlace.
 *
 * Es la vista mas restringida de todas. La ruta es publica (solo protegida por
 * el enlace + el correo), asi que aqui se nombra campo por campo lo que sale.
 * No se devuelve el objeto de Prisma: si manana se agrega una columna al
 * paciente, no se filtra sola por esta puerta.
 */
/**
 * Lo que ve quien todavía NO ha aceptado el caso.
 *
 * Para decidir si puede acompañar a alguien hace falta saber dónde está, cómo
 * prefiere que sea y cuándo puede — no su nombre, su teléfono ni su correo.
 * Esos datos aparecen cuando acepta, no antes: si dice que no, no se lleva
 * nada de una persona que nunca fue suya.
 */
export function casoPropuesto(p) {
  return {
    city: p.city,
    priority: p.priority,
    prioridadLegible: ETIQUETAS_PRIORIDAD[p.priority] ?? p.priority,
    preferredModality: p.preferredModality,
    isMinor: p.isMinor,
    availableDays: p.availableDays,
    availableSlots: p.availableSlots,
  }
}

export function casoCompartido(p, citas) {
  return {
    fullName: p.fullName,
    city: p.city,
    priority: p.priority,
    prioridadLegible: ETIQUETAS_PRIORIDAD[p.priority] ?? p.priority,
    phone: p.phone,
    email: p.email,
    preferredContact: p.preferredContact,
    preferredModality: p.preferredModality,
    isMinor: p.isMinor,
    // Si es menor de edad, con quien hay que hablar.
    contactName: p.isMinor ? p.contactName : null,
    relationship: p.isMinor ? p.relationship : null,
    availableDays: p.availableDays,
    availableSlots: p.availableSlots,
    appointments: citas.map((c) => ({
      id: c.id,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      modality: c.modality,
      status: c.status,
    })),
  }
}
