-- En qué idioma se llenó cada formulario del sitio público.
--
-- El sitio pasó a existir en español, inglés y portugués. Las respuestas se
-- guardan igual en los tres —los valores de cada opción son los mismos—, así
-- que una solicitud llegada en inglés era indistinguible de una en español: lo
-- único que la delataba era el indicativo del celular, o el idioma del mensaje
-- si la persona escribió alguno. Quien llamaba se enteraba al teléfono.
--
-- Vale `es`, `en` o `pt`. Es texto y no un enum para poder añadir un idioma
-- sin migrar: la lista vive en `src/validators/idioma.js`.
--
-- Va en las tres tablas de entrada, y además en `patients` y `professionals`:
-- se copia al admitir o aprobar, porque el equipo trabaja desde esas fichas y
-- no desde el formulario del que nacieron.
--
-- Nulo a propósito en todo lo ya escrito: de eso no se sabe en qué idioma se
-- llenó, y poner `es` sería afirmar algo que nadie comprobó.
ALTER TABLE "support_requests" ADD COLUMN "form_locale" VARCHAR(5);
ALTER TABLE "volunteers" ADD COLUMN "form_locale" VARCHAR(5);
ALTER TABLE "collaborators" ADD COLUMN "form_locale" VARCHAR(5);
ALTER TABLE "patients" ADD COLUMN "form_locale" VARCHAR(5);
ALTER TABLE "professionals" ADD COLUMN "form_locale" VARCHAR(5);
