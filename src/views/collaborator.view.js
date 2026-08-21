import { ETIQUETAS_AREA } from '../catalogos.js'

/**
 * VISTA: Collaborator
 *
 * Nunca se devuelve el registro crudo de la base: aquí se decide qué sale.
 */

/** Lo que ve quien acaba de enviar el formulario. Solo su acuse. */
export function collaboratorReceipt(colaborador) {
  return {
    id: colaborador.id,
    fullName: colaborador.fullName,
    createdAt: colaborador.createdAt,
  }
}

export function collaboratorAdmin(c) {
  return {
    id: c.id,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    city: c.city,

    area: c.area,
    areaLegible: ETIQUETAS_AREA[c.area] ?? c.area,
    // Si eligió "Otra", lo que sirve para buscarla es lo que escribió.
    discipline: c.discipline === 'Otra' && c.disciplineOther ? c.disciplineOther : c.discipline,
    disciplineOther: c.disciplineOther,
    yearsExperience: c.yearsExperience,
    professionalCard: c.professionalCard,
    skills: c.skills,

    modality: c.modality,
    availableToTravel: c.availableToTravel,
    availableDays: c.availableDays,
    availableSlots: c.availableSlots,
    weeklyHours: c.weeklyHours,
    yellowFeverVaccine: c.yellowFeverVaccine,

    consentVersion: c.consentVersion,
    dataConsent: c.dataConsent,
    sensitiveDataConsent: c.sensitiveDataConsent,
    communicationsConsent: c.communicationsConsent,

    status: c.status,
    createdAt: c.createdAt,
  }
}

export function collaboratorAdminList(lista) {
  return lista.map(collaboratorAdmin)
}

/** El resumen por área que encabeza el directorio. */
export function resumenPorArea(grupos) {
  return grupos.map((g) => ({
    area: g.area,
    areaLegible: ETIQUETAS_AREA[g.area] ?? g.area,
    total: g._count,
  }))
}
