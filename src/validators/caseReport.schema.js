import { z } from 'zod'

/**
 * Reporte del profesional sobre su asignación.
 *
 * Lo que se pregunta es la logística del contacto: si se logró, cuándo
 * quedaron y qué estorbó. NO se pregunta nada de lo que se habló en la
 * sesión: la red decidió no almacenar contenido clínico, y un campo abierto
 * sin límite claro es justo por donde eso se cuela.
 */

export const RESULTADOS = [
  'CITA_ACORDADA',
  'YA_ATENDIDA',
  'NO_CONTESTA',
  'DATOS_ERRADOS',
  'NO_QUIERE',
  'SIGO_INTENTANDO',
  'NO_ASISTIO',
  'OTRO',
]

/** Los resultados en los que hubo o habrá un encuentro. */
export const CON_ENCUENTRO = ['CITA_ACORDADA', 'YA_ATENDIDA']

const opcional = (max) => z.string().trim().max(max).optional().or(z.literal(''))

const choiceOpcional = (values) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.enum(values, { errorMap: () => ({ message: 'Selecciona una opción' }) }).optional(),
  )

export const caseReportCreateSchema = z
  .object({
    outcome: z.enum(RESULTADOS, {
      errorMap: () => ({ message: 'Cuéntanos qué pasó' }),
    }),
    modality: choiceOpcional(['PRESENCIAL', 'VIRTUAL']),
    /** Fecha y hora en ISO. Solo tiene sentido si quedaron en algo. */
    meetsAt: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.coerce.date({ errorMap: () => ({ message: 'Esa fecha no es válida' }) }).optional(),
    ),
    contactDifficulties: opcional(600),
    notes: opcional(1000),
    /** Qué sigue. Solo cuando la sesión ya se hizo. */
    followUp: choiceOpcional(['NECESITA_MAS', 'SUFICIENTE', 'NO_SABE']),
  })
  // Si hubo encuentro, hace falta saber si fue presencial o virtual: es lo
  // que la coordinación necesita para saber si hay que mover a alguien.
  .refine((d) => !CON_ENCUENTRO.includes(d.outcome) || Boolean(d.modality), {
    message: 'Dinos si fue presencial o virtual',
    path: ['modality'],
  })
  // Una cita acordada sin fecha no sirve para hacerle seguimiento.
  .refine((d) => d.outcome !== 'CITA_ACORDADA' || Boolean(d.meetsAt), {
    message: 'Dinos para cuándo quedaron',
    path: ['meetsAt'],
  })
  /**
   * Y esa fecha tiene que estar por delante.
   *
   * Una profesional escribió 9 de febrero queriendo decir 2 de septiembre —el
   * campo se ve en el orden que decida su navegador, y se teclea al revés
   * sin notarlo— y el reporte se guardó con una cita de hace medio año. La
   * ficha lo enseñó tal cual durante días, al lado de la cita real, y el
   * botón de «agendar la cita acordada» proponía esa fecha imposible.
   *
   * «Quedamos en una cita» para un día que ya pasó no puede ser verdad. Se
   * frena aquí, en el servidor, y no solo en el formulario: el formulario es
   * una cortesía; esto es la puerta.
   */
  .refine((d) => d.outcome !== 'CITA_ACORDADA' || !d.meetsAt || d.meetsAt.getTime() > Date.now(), {
    message: 'Esa fecha ya pasó. Revisa el día y el mes.',
    path: ['meetsAt'],
  })
  // "Otra cosa" obliga a decir cuál: si no, el reporte no dice nada.
  .refine((d) => d.outcome !== 'OTRO' || Boolean(d.notes?.trim()), {
    message: 'Cuéntanos brevemente qué pasó',
    path: ['notes'],
  })
  /**
   * "Ya la acompañé" sin decir qué sigue no le sirve a nadie: es LA respuesta
   * que le permite a coordinación agendar la siguiente o cerrar el caso.
   */
  .refine((d) => d.outcome !== 'YA_ATENDIDA' || Boolean(d.followUp), {
    message: 'Dinos si necesita más sesiones o con esta fue suficiente',
    path: ['followUp'],
  })
