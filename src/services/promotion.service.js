import { prisma } from '../config/database.js'
import { ProfessionalModel } from '../models/professional.model.js'
import { PatientModel } from '../models/patient.model.js'
import { VolunteerModel } from '../models/volunteer.model.js'
import { SupportRequestModel } from '../models/supportRequest.model.js'
import { DomainError } from '../errors/DomainError.js'
import { avisoPosibleDuplicado } from '../notifications/eventos.js'

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

  // Quien aprueba puede corregir la modalidad que declaró la persona.
  const modalidad = ajustes.modality ?? postulacion.modality

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
        modality: modalidad,
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
          modality: modalidad,
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

  /**
   * La misma persona en crisis puede llenar el formulario dos veces. No se
   * bloquea la admisión —el tamizaje admite solo y aquí no hay nadie a quien
   * preguntarle—, pero coordinación se entera para unir en vez de duplicar:
   * dos fichas de la misma persona son dos profesionales llamando al mismo
   * teléfono.
   */
  // La comparación es en JS y no en el where: el teléfono guardado puede
  // traer espacios o indicativo, y `contains` sobre texto formateado falla.
  const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '').slice(-10)
  const telefono = soloDigitos(solicitud.phone)
  let duplicadaDe = null
  if (telefono.length >= 7) {
    const activas = await prisma.patient.findMany({
      where: { deletedAt: null, status: { not: 'CERRADO' } },
      select: { id: true, city: true, phone: true },
    })
    duplicadaDe = activas.find((a) => soloDigitos(a.phone) === telefono) ?? null
  }

  const admitida = await prisma.$transaction(async (tx) => {
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
        // Lo que respondió en el tamizaje manda sobre lo que trajo la
        // solicitud: es más fresco, y el formulario público pide esto como
        // opcional, así que casi siempre viene vacío.
        preferredModality: ajustes.preferredModality ?? solicitud.preferredModality,
        availableDays: ajustes.availableDays ?? solicitud.availableDays ?? [],
        availableSlots: ajustes.availableSlots ?? solicitud.availableSlots ?? [],
        priority: ajustes.priority,
        status: 'EN_ADMISION',
      },
    })

    await tx.supportRequest.update({
      where: { id: supportRequestId },
      data: { status: 'EN_REVISION' },
    })

    return paciente
  })

  if (duplicadaDe) {
    await avisoPosibleDuplicado({ nueva: admitida, existente: duplicadaDe })
  }

  return admitida
}

/**
 * Admisión automática a partir del tamizaje.
 *
 * Antes esto lo hacía una persona: abría la bandeja, miraba la solicitud y
 * elegía prioridad a ojo. Ahora la prioridad sale de lo que respondió quien
 * pidió ayuda, así que no queda nada que decidir, y esperar a que un
 * voluntario abra el portal solo añade horas de espera a alguien que ya dijo
 * cómo está.
 *
 * Si ya estaba admitida no se duplica: se le actualiza la prioridad. Quien
 * responde por segunda vez casi siempre lo hace porque está peor que antes, y
 * ese es justamente el caso en el que la cola tiene que reordenarse.
 */
export async function admitirPorTamizaje({ supportRequestId, prioridad, disponibilidad = {} }) {
  const yaExiste = await PatientModel.findBySupportRequestId(supportRequestId)

  if (yaExiste) {
    // Responder otra vez actualiza también cuándo puede: si contesta de nuevo
    // suele ser porque algo cambió, y lo que cambió puede ser justamente eso.
    const cambios = { ...disponibilidad }
    if (yaExiste.priority !== prioridad) cambios.priority = prioridad

    const actualizado = await PatientModel.update(yaExiste.id, cambios)
    return {
      paciente: actualizado,
      nuevo: false,
      prioridadAnterior: yaExiste.priority !== prioridad ? yaExiste.priority : null,
    }
  }

  const paciente = await admitirSolicitud({
    supportRequestId,
    ajustes: { priority: prioridad, ...disponibilidad },
  })
  return { paciente, nuevo: true, prioridadAnterior: null }
}

/**
 * Cuántos días se espera la respuesta al tamizaje antes de admitir igual.
 *
 * Son dos y no tres a propósito. La prioridad que se le pone es MEDIA, que
 * significa «en los próximos días»: si el rescate tardara tres, alguien que
 * pidió ayuda estaría a casi una semana de que le busquen profesional. Errar
 * por admitir de más cuesta una llamada; errar por admitir de menos cuesta que
 * la persona nunca aparezca en la cola.
 */
export const DIAS_SIN_RESPUESTA = Number(process.env.ADMISION_AUTOMATICA_DIAS ?? 2)

/**
 * Con qué prioridad entra quien nunca respondió el tamizaje.
 *
 * MEDIA, porque no sabemos cómo está: ponerla en BAJA sería decidir que puede
 * esperar sin que nadie lo haya comprobado, y en ALTA sería llenar de urgencias
 * falsas la cola y volver la etiqueta inútil.
 *
 * La excepción es la misma que en el tamizaje: en un menor de edad, MEDIA sube
 * a ALTA. No puede gestionar su propia espera, y quien responde por él puede
 * no estar viendo lo mismo.
 */
export function prioridadPorSilencio(solicitud) {
  return solicitud?.isMinor === true ? 'ALTA' : 'MEDIA'
}

/**
 * ¿Le toca ya el rescate a esta solicitud?
 *
 * Se mide desde que llegó y no desde que se le mandó el enlace, porque el
 * enlace no deja rastro de cuándo se envió: se firma en el momento de pintar
 * la fila. Medir desde la llegada además es lo correcto para el caso que de
 * verdad importa, que es el de la solicitud a la que nadie le mandó nada.
 */
export function toca(solicitud, { ahora = new Date(), dias = DIAS_SIN_RESPUESTA } = {}) {
  const transcurridos = (ahora.getTime() - new Date(solicitud.createdAt).getTime()) / 86400000
  return transcurridos >= dias
}
