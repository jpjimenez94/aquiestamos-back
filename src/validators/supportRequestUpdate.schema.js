import { z } from 'zod'
import { WEEKDAYS, DAY_SLOTS } from './volunteer.schema.js'

/**
 * Corregir los datos de una solicitud, desde el portal.
 *
 * Llegan con el teléfono mal digitado, el nombre a medias o la ciudad en
 * blanco, y hasta ahora la única salida era borrar la solicitud y pedirle a la
 * persona que volviera a llenar el formulario — a alguien que ya pidió ayuda
 * una vez.
 *
 * Lo que NO se puede tocar, a propósito:
 *
 *   · Las autorizaciones (`dataConsent`, `sensitiveDataConsent`,
 *     `guardianConsent`, `communicationsConsent`, `consentVersion`). No son
 *     campos: son el registro de lo que una persona autorizó, con su versión y
 *     su fecha. Editarlas sería reescribir un consentimiento en nombre de
 *     quien lo dio, y es justo lo que un consentimiento existe para impedir.
 *     Si alguien quiere retirar su autorización, eso es un borrado, no una
 *     edición.
 *
 *   · El estado. Admitir y descartar tienen sus propios caminos, con sus
 *     efectos y su auditoría; cambiarlo por aquí los saltaría.
 *
 * Todos los campos son opcionales: se manda solo lo que cambia.
 */

const texto = (max) => z.string().trim().max(max)
const opcional = (max) => texto(max).optional().or(z.literal(''))

export const supportRequestUpdateSchema = z
  .object({
    // --- Para quién es ---
    forWhom: z.enum(['PARA_MI', 'PARA_OTRA_PERSONA']).optional(),
    isMinor: z.boolean().optional().nullable(),
    relationship: opcional(120),
    contactName: opcional(160),

    // --- Contacto ---
    name: texto(160).min(1, 'El nombre no puede quedar vacío').optional(),
    phone: texto(40)
      .min(1, 'El teléfono no puede quedar vacío')
      .regex(/^[0-9+()\s-]{7,40}$/, 'Número de teléfono no válido')
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Correo no válido')
      .max(160)
      .optional()
      .or(z.literal('')),
    preferredContact: z.enum(['WHATSAPP', 'LLAMADA', 'CORREO']).optional(),
    city: texto(160).min(1, 'La ciudad no puede quedar vacía').optional(),

    // --- Cuándo y cómo ---
    preferredModality: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.enum(['PRESENCIAL', 'VIRTUAL', 'INDIFERENTE']).optional(),
    ),
    availableDays: z.array(z.enum(WEEKDAYS)).optional(),
    availableSlots: z.array(z.enum(DAY_SLOTS)).optional(),
    message: opcional(1000),
  })
  .strict({ message: 'Ese campo no se puede editar desde aquí' })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'No mandaste ningún cambio',
  })

/** Los campos que, si cambian, también hay que corregirle a la persona admitida. */
export const CAMPOS_QUE_VIAJAN_A_LA_PERSONA = {
  name: 'fullName',
  phone: 'phone',
  email: 'email',
  city: 'city',
  forWhom: 'forWhom',
  isMinor: 'isMinor',
  contactName: 'contactName',
  relationship: 'relationship',
  preferredContact: 'preferredContact',
  preferredModality: 'preferredModality',
  availableDays: 'availableDays',
  availableSlots: 'availableSlots',
}
