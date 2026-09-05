import { puede } from '../auth/permissions.js'
import { ETIQUETAS_ESTADO_PROFESIONAL } from '../catalogos.js'

/**
 * VISTA: Professional
 * Las notas internas solo salen para el administrador.
 */
export function profesionalBase(p) {
  return {
    id: p.id,
    fullName: p.fullName,
    email: p.email,
    phone: p.phone,
    city: p.city,
    profession: p.profession,
    yearsExperience: p.yearsExperience,
    professionalCard: p.professionalCard,
    professionalCardNumber: p.professionalCardNumber,
    professionalCardDocumentUrl: p.professionalCardDocumentUrl,
    professionalCardVerified: p.professionalCardVerified ?? false,
    professionalCardVerifiedAt: p.professionalCardVerifiedAt,
    professionalCardVerifiedBy: p.professionalCardVerifiedBy,
    identityDocumentUrl: p.identityDocumentUrl ?? null,
    identityDocumentBackUrl: p.identityDocumentBackUrl ?? null,
    documentsSubmittedAt: p.documentsSubmittedAt ?? null,
    populations: p.populations,
    modality: p.modality,
    travelsTo: p.travelsTo,
    status: p.status,
    estadoLegible: ETIQUETAS_ESTADO_PROFESIONAL[p.status] ?? p.status,
    maxActiveCases: p.maxActiveCases,
    // Cuidado del equipo: si se ofreció a facilitar sesiones grupales. La
    // ficha lo enseña y, con permiso, lo cambia.
    supervisorVolunteer: p.supervisorVolunteer === true,
    supervisorVolunteerAt: p.supervisorVolunteerAt ?? null,
    tieneCuenta: Boolean(p.userId),
    createdAt: p.createdAt,
  }
}

export function profesionalAdmin(p) {
  return { ...profesionalBase(p), notes: p.notes, volunteerId: p.volunteerId }
}

export function profesionalSegunRol(p, usuario) {
  return puede(usuario, 'dato-sensible:ver') ? profesionalAdmin(p) : profesionalBase(p)
}

export function profesionalLista(lista, usuario) {
  return lista.map((p) => profesionalSegunRol(p, usuario))
}

/** Con la carga calculada, para la pantalla de emparejamiento. */
export function profesionalConCarga(entrada, usuario) {
  return {
    ...profesionalSegunRol(entrada.profesional, usuario),
    carga: entrada.carga,
    cupo: entrada.cupo,
    sinCupo: entrada.sinCupo,
    huecosLibres: entrada.huecosLibres,
    huecosQueLeSirven: entrada.huecosQueLeSirven,
    primerHueco: entrada.primerHueco,
    franjaDelPrimerHueco: entrada.franjaDelPrimerHueco,
    puntos: entrada.puntos,
    razones: entrada.razones,
  }
}
