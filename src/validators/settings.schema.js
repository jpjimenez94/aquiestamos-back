import { z } from 'zod'

export const updateSettingSchema = z.object({
  value: z.string({ required_error: 'El valor es obligatorio' }).min(1, 'El valor no puede estar vacío'),
})

export const previewSettingSchema = z.object({
  template: z.string({ required_error: 'La plantilla es obligatoria' }),
  variables: z.record(z.any()).optional().default({}),
})
