import { z } from 'zod'

/**
 * Las dos preguntas de la encuesta del cierre. Cortas a propósito: cada campo
 * de más es gente que abandona, y esta encuesta vale por respondida.
 */
export const responderEncuestaSchema = z.object({
  helped: z.enum(['SI', 'ALGO', 'NO'], {
    errorMap: () => ({ message: 'Cuéntanos si te sirvió' }),
  }),
  wouldRecommend: z.boolean({
    errorMap: () => ({ message: 'Cuéntanos si lo recomendarías' }),
  }),
  comment: z.string().trim().max(500).optional().or(z.literal('')),
})
