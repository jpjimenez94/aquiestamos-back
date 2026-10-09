import { z } from 'zod'

/**
 * Los idiomas en que existe el sitio público, y con él sus tres formularios.
 * Es la misma lista que `IDIOMAS` en `front/lib/i18n/idiomas.ts`.
 */
export const IDIOMAS_DEL_FORMULARIO = ['es', 'en', 'pt']

/**
 * En qué idioma se llenó el formulario.
 *
 * No lo escribe la persona: lo manda el sitio, según la página desde la que se
 * envió (`/`, `/en/…` o `/pt/…`). Se guarda para dos cosas:
 *
 *   · que quien vaya a llamar sepa de antemano que quizá esa persona no habla
 *     español, en vez de descubrirlo al teléfono;
 *   · dejar constancia de en qué idioma leyó la autorización que aceptó. La
 *     versión del texto es la misma en los tres (`consentVersion`), pero lo
 *     que tuvo delante fue la traducción.
 *
 * Es opcional y NUNCA rechaza un envío. Si no viene, o viene algo que no se
 * reconoce, se guarda «no se sabe». Devolverle un error a quien está pidiendo
 * ayuda porque llegó mal un dato que ni siquiera tecleó sería poner el
 * registro por delante de la persona.
 *
 * Se queda con la lengua y descarta el país: «pt-BR» es «pt».
 */
export const idiomaDelFormulario = z.preprocess((valor) => {
  if (typeof valor !== 'string') return undefined
  const lengua = valor.trim().toLowerCase().split(/[-_]/)[0]
  return IDIOMAS_DEL_FORMULARIO.includes(lengua) ? lengua : undefined
}, z.enum(IDIOMAS_DEL_FORMULARIO).optional())
