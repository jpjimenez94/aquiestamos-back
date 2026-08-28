import { puede } from '../auth/permissions.js'
import { tamizajeResumen, tamizajeCompleto } from './triage.view.js'

/**
 * VISTA: SupportRequest
 */
export function supportRequestReceipt(request) {
  return {
    id: request.id,
    name: request.name,
    createdAt: request.createdAt,
  }
}

/**
 * Lo que ve quien agenda. Deliberadamente SIN el campo `message`: el agendador
 * necesita saber que la persona existe y cuando puede, no lo que escribio sobre
 * como se siente.
 */
export function supportRequestAgendador(request) {
  return {
    id: request.id,
    name: request.name,
    phone: request.phone,
    email: request.email,
    preferredContact: request.preferredContact,
    city: request.city ?? request.place,
    forWhom: request.forWhom,
    isMinor: request.isMinor,
    preferredModality: request.preferredModality,
    availableDays: request.availableDays,
    availableSlots: request.availableSlots,
    status: request.status,
    createdAt: request.createdAt,
    /**
     * El tamizaje: por dónde mandárselo y, si ya respondió, qué prioridad
     * salió y por qué. Van las RAZONES, no las respuestas pregunta por
     * pregunta: la razón es lo que hace falta para decidir, y el detalle es
     * dato de salud que solo se abre para la administración.
     */
    tamizaje: request.tamizaje
      ? {
          enlace: request.tamizaje.enlace,
          respuesta: tamizajeResumen(request.tamizaje.respuesta),
          diasParaAdmisionAutomatica: request.tamizaje.diasParaAdmisionAutomatica,
        }
      : null,
  }
}

/** Lo que ve un administrador: todo, incluido el texto libre y el rastro de consentimiento. */
export function supportRequestAdmin(request) {
  return {
    ...supportRequestAgendador(request),
    tamizaje: request.tamizaje
      ? {
          enlace: request.tamizaje.enlace,
          respuesta: tamizajeCompleto(request.tamizaje.respuesta),
          diasParaAdmisionAutomatica: request.tamizaje.diasParaAdmisionAutomatica,
        }
      : null,
    contactName: request.contactName,
    relationship: request.relationship,
    message: request.message,
    consentVersion: request.consentVersion,
    dataConsent: request.dataConsent,
    sensitiveDataConsent: request.sensitiveDataConsent,
    guardianConsent: request.guardianConsent,
    communicationsConsent: request.communicationsConsent,
  }
}

export function supportRequestAdminList(requests) {
  return requests.map(supportRequestAdmin)
}

/** Elige la vista segun el rol de quien consulta. */
export function supportRequestListaSegunRol(requests, usuario) {
  const paraAdmin = puede(usuario, 'dato-sensible:ver')
  return requests.map(paraAdmin ? supportRequestAdmin : supportRequestAgendador)
}
