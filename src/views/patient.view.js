import { ETIQUETAS_ESTADO_PACIENTE } from '../catalogos.js'

/**
 * VISTA: Patient
 *
 * Quien agenda necesita saber que la persona existe y cuando puede. No necesita
 * su correo ni el detalle de quien la acompana en casa.
 */
export function pacienteParaAgendador(p) {
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
    createdAt: p.createdAt,
    diasEsperando: Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000),
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
