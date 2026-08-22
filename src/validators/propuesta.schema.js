import { z } from 'zod'

/**
 * La respuesta del profesional a un caso que le proponen.
 *
 * Los días y las franjas van en los mismos enums que usa todo el sistema, y no
 * en texto libre, porque quien coordina los va a cruzar con los que puede la
 * persona acompañada. Un "los martes por la tarde, creo" escrito a mano no se
 * cruza con nada.
 *
 * La nota existe para el matiz que no cabe en un enum: "después de las 4
 * mejor", "los jueves solo si es virtual".
 */

const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
const FRANJAS = ['MANANA', 'TARDE', 'NOCHE']

export const respuestaPropuestaSchema = z
  .object({
    acepta: z.boolean({
      required_error: 'Dinos si puedes acompañar este caso',
      invalid_type_error: 'Dinos si puedes acompañar este caso',
    }),
    dias: z.array(z.enum(DIAS)).default([]),
    franjas: z.array(z.enum(FRANJAS)).default([]),
    nota: z.string().trim().max(600).optional().or(z.literal('')),
    motivo: z.string().trim().max(300).optional().or(z.literal('')),
  })
  // Aceptar sin decir cuándo deja el caso igual de parado que no aceptar, y
  // encima con quien coordina creyendo que avanzó.
  .refine((d) => !d.acepta || d.dias.length > 0, {
    message: 'Dinos qué días puedes',
    path: ['dias'],
  })
  .refine((d) => !d.acepta || d.franjas.length > 0, {
    message: 'Dinos en qué franjas puedes',
    path: ['franjas'],
  })
  // Saber por qué no puede es lo que permite distinguir un problema del caso
  // —queda lejos, es un horario imposible— de uno de la red.
  .refine((d) => d.acepta || Boolean(d.motivo?.trim()), {
    message: 'Cuéntanos brevemente por qué no puedes',
    path: ['motivo'],
  })
