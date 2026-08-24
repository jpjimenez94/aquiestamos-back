import { z } from 'zod'

/** El envío final: las dos claves del bucket y el número, si lo tiene. */
export const enviarDocumentosSchema = z.object({
  claveTarjeta: z.string().trim().min(5).max(500),
  claveIdentidad: z.string().trim().min(5).max(500),
  numeroTarjeta: z.string().trim().max(60).optional().or(z.literal('')),
})
