import { crearEnlaceDocumentos } from '../auth/enlaceDocumentos.js'
import { env } from '../config/env.js'

/**
 * VISTA: Volunteer
 * Nunca devolvemos el registro crudo de la base de datos: aquí se decide
 * qué campos son públicos y cuáles solo se exponen al panel administrativo.
 */
export function volunteerReceipt(volunteer) {
  return {
    id: volunteer.id,
    fullName: volunteer.fullName,
    createdAt: volunteer.createdAt,
  }
}

export function volunteerAdmin(volunteer) {
  return {
    id: volunteer.id,
    fullName: volunteer.fullName,
    email: volunteer.email,
    phone: volunteer.phone,
    // `city` sustituyo a `residence`; los registros viejos solo tienen el segundo.
    city: volunteer.city ?? volunteer.residence,

    profession: volunteer.profession ?? volunteer.training,
    additionalTraining: volunteer.additionalTraining,
    yearsExperience: volunteer.yearsExperience,
    professionalCard: volunteer.professionalCard,
    populations: volunteer.populations,
    populationOther: volunteer.populationOther,
    crisisExperience: volunteer.crisisExperience,

    modality: volunteer.modality,
    availableToTravel: volunteer.availableToTravel,
    availableDays: volunteer.availableDays,
    availableSlots: volunteer.availableSlots,
    weeklyHours: volunteer.weeklyHours,
    yellowFeverVaccine: volunteer.yellowFeverVaccine,

    consentVersion: volunteer.consentVersion,
    dataConsent: volunteer.dataConsent,
    sensitiveDataConsent: volunteer.sensitiveDataConsent,
    communicationsConsent: volunteer.communicationsConsent,

    status: volunteer.status,
    createdAt: volunteer.createdAt,
    // Si ya fue promovido, el id del profesional y estado de su tarjeta profesional
    professionalId: volunteer.professional?.id ?? null,
    professionalCardVerified: volunteer.professional?.professionalCardVerified ?? false,
    // El enlace por el que el profesional sube sus documentos. Solo si falta.
    enlaceDocumentos:
      volunteer.professional && !volunteer.professional.professionalCardVerified
        ? `${env.sitioUrl.replace(/\/$/, '')}/documentos/${crearEnlaceDocumentos(volunteer.professional.id)}`
        : null,
    professionalCardNumber: volunteer.professional?.professionalCardNumber ?? null,
    professionalCardDocumentUrl: volunteer.professional?.professionalCardDocumentUrl ?? null,
  }
}

export function volunteerAdminList(volunteers) {
  return volunteers.map(volunteerAdmin)
}
