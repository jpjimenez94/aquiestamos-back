import { z } from 'zod'

export const responderFeedbackSchema = z.object({
  howFelt: z.enum(['MUY_BIEN', 'BIEN', 'REGULAR', 'INCOMODO'], {
    errorMap: () => ({ message: 'Cuéntanos cómo te sentiste en la sesión' }),
  }),
  respectfulTreatment: z.enum(['EXCELENTE', 'ADECUADO', 'A_MEJORAR']).optional().nullable(),
  gotTools: z.enum(['MUCHA_CLARIDAD', 'ALGO', 'POCO_O_NADA']).optional().nullable(),
  sessionQuality: z.enum(['SIN_PROBLEMAS', 'CON_DIFICULTADES', 'PREFIERO_OTRA_MODALIDAD']).optional().nullable(),
  wantsToContinue: z.enum(['SI_MISMO', 'CAMBIAR', 'SUFICIENTE'], {
    errorMap: () => ({ message: 'Cuéntanos si deseas continuar con este profesional' }),
  }),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
})

