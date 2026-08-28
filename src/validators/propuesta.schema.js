import { z } from 'zod'

/**
 * La respuesta del profesional a un caso que le proponen: puedo o no puedo.
 *
 * Aquí se le pedían además los días y las franjas en las que podía, y eran
 * obligatorios para aceptar. Se fueron. Su agenda está cargada desde que se
 * registró —los 48 profesionales asignables la tienen— y es de ahí de donde la
 * persona elige su hora; pedírselos otra vez era pedirle dos veces lo mismo.
 *
 * Y estaba en el peor sitio posible: de cada ocho asignaciones, siete se
 * perdían esperando esta respuesta. Era un formulario donde debía haber un
 * botón.
 *
 * La nota se queda, para el matiz que no cabe en una agenda: «después de las 4
 * mejor», «los jueves solo si es virtual».
 */


export const respuestaPropuestaSchema = z
  .object({
    acepta: z.boolean({
      required_error: 'Dinos si puedes acompañar este caso',
      invalid_type_error: 'Dinos si puedes acompañar este caso',
    }),
    nota: z.string().trim().max(600).optional().or(z.literal('')),
    motivo: z.string().trim().max(300).optional().or(z.literal('')),
  })
  // Saber por qué no puede es lo que permite distinguir un problema del caso
  // —queda lejos, es un horario imposible— de uno de la red.
  .refine((d) => d.acepta || Boolean(d.motivo?.trim()), {
    message: 'Cuéntanos brevemente por qué no puedes',
    path: ['motivo'],
  })
