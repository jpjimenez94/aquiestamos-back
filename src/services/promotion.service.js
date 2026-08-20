import { prisma } from '../config/database.js'
import { ProfessionalModel } from '../models/professional.model.js'
import { PatientModel } from '../models/patient.model.js'
import { VolunteerModel } from '../models/volunteer.model.js'
import { SupportRequestModel } from '../models/supportRequest.model.js'
import { DomainError } from '../errors/DomainError.js'

/**
 * SERVICIO: promoción de un formulario a entidad operativa.
 *
 * El registro del formulario es la prueba de lo que la persona envió y no se
 * toca nunca. La entidad que nace aquí sí se edita: es la que el equipo
 * administra. Quedan enlazadas por `volunteerId` / `supportRequestId`.
 */

/** Aprobar una postulación crea el profesional. */
export async function aprobarPostulacion({ volunteerId, ajustes = {} }) {
  const postulacion = await VolunteerModel.findById(volunteerId)
  if (!postulacion) throw new DomainError('NO_ENCONTRADO', 'La postulación no existe')

  const yaExiste = await ProfessionalModel.findByVolunteerId(volunteerId)
  if (yaExiste) {
    throw new DomainError('YA_PROMOVIDO', 'Esa postulación ya se aprobó', {
      professionalId: yaExiste.id,
    })
  }

  return prisma.$transaction(async (tx) => {
    const profesional = await tx.professional.create({
      data: {
        volunteerId,
        fullName: postulacion.fullName,
        email: postulacion.email,
        phone: postulacion.phone,
        // Los registros del primer formulario solo tienen `residence`.
        city: ajustes.city ?? postulacion.city ?? postulacion.residence ?? 'Sin especificar',
        profession: ajustes.profession ?? postulacion.profession ?? postulacion.training ?? 'Sin especificar',
        yearsExperience: postulacion.yearsExperience,
        professionalCard: postulacion.professionalCard,
        populations: postulacion.populations,
        modality: postulacion.modality,
        travelsTo: postulacion.availableToTravel,
        // Nace pendiente de validación: alguien tiene que revisar su tarjeta
        // profesional antes de que reciba casos.
        status: ajustes.status ?? 'PENDIENTE_VALIDACION',
        maxActiveCases: ajustes.maxActiveCases ?? 3,
      },
    })

    // Las franjas que declaró en el formulario se convierten en su
    // disponibilidad inicial. Después él mismo puede afinarlas.
    const reglas = []
    const FRANJAS = {
      MANANA: [8 * 60, 12 * 60],
      TARDE: [12 * 60, 18 * 60],
      NOCHE: [18 * 60, 21 * 60],
    }

    for (const dia of postulacion.availableDays ?? []) {
      for (const franja of postulacion.availableSlots ?? []) {
        const rango = FRANJAS[franja]
        if (!rango) continue
        reglas.push({
          professionalId: profesional.id,
          weekday: dia,
          startMinute: rango[0],
          endMinute: rango[1],
          modality: postulacion.modality,
        })
      }
    }

    if (reglas.length > 0) {
      await tx.availabilityRule.createMany({ data: reglas })
    }

    await tx.volunteer.update({ where: { id: volunteerId }, data: { status: 'ACTIVO' } })

    return { profesional, franjasCreadas: reglas.length }
  })
}

/** Admitir una solicitud crea la persona acompañada. */
export async function admitirSolicitud({ supportRequestId, ajustes = {} }) {
  const solicitud = await SupportRequestModel.findById(supportRequestId)
  if (!solicitud) throw new DomainError('NO_ENCONTRADO', 'La solicitud no existe')

  const yaExiste = await PatientModel.findBySupportRequestId(supportRequestId)
  if (yaExiste) {
    throw new DomainError('YA_PROMOVIDO', 'Esa solicitud ya se admitió', {
      patientId: yaExiste.id,
    })
  }

  return prisma.$transaction(async (tx) => {
    const paciente = await tx.patient.create({
      data: {
        supportRequestId,
        fullName: solicitud.name,
        phone: solicitud.phone,
        email: solicitud.email,
        city: ajustes.city ?? solicitud.city ?? solicitud.place ?? 'Sin especificar',
        forWhom: solicitud.forWhom,
        isMinor: solicitud.isMinor ?? false,
        contactName: solicitud.contactName,
        relationship: solicitud.relationship,
        preferredContact: solicitud.preferredContact,
        preferredModality: solicitud.preferredModality,
        availableDays: solicitud.availableDays ?? [],
        availableSlots: solicitud.availableSlots ?? [],
        status: 'EN_ADMISION',
      },
    })

    await tx.supportRequest.update({
      where: { id: supportRequestId },
      data: { status: 'EN_REVISION' },
    })

    return paciente
  })
}
