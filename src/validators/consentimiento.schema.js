import { z } from 'zod'

/**
 * Lo que escribe quien decide no tomar el acompañamiento.
 *
 * El nombre se pide y no se da por bueno el de la ficha: quien firma es quien
 * escribe. El motivo es opcional a propósito — desistir es su derecho y nadie
 * tiene que justificarse para ejercerlo.
 */
export const desistimientoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, 'Escribe tu nombre completo')
    .max(160),
  motivo: z.string().trim().max(600).optional().nullable(),
})

/**
 * Lo que manda la persona al firmar. El nombre tecleado ES la firma: por eso
 * es obligatorio y no puede ser una letra suelta. La versión dice qué texto
 * exacto aceptó; sin ella, un "sí" de agosto no prueba nada en noviembre.
 */
export const firmarConsentimientoSchema = z.object({
  acepta: z.literal(true, {
    errorMap: () => ({ message: 'Para continuar hay que aceptar el consentimiento' }),
  }),
  nombreFirma: z
    .string({ required_error: 'Escribe tu nombre completo: esa es tu firma' })
    .trim()
    .min(5, 'Escribe tu nombre completo: esa es tu firma')
    .max(120),
  version: z.string().trim().min(1).max(20),
})
