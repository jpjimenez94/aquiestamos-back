-- ---------------------------------------------------------------------------
-- El tamizaje pregunta también cuándo puede y cómo lo prefiere.
--
-- El formulario público ya lo preguntaba, pero como opcional, y de las cinco
-- solicitudes que había ninguna lo traía. La consecuencia salía al otro lado:
-- la propuesta le llegaba al profesional sin más dato que la ciudad, y él
-- decidía si podía acompañar a alguien sin saber cuándo puede esa persona.
--
-- Aquí sí lo responde, porque ya está contestando siete preguntas y estas le
-- cuestan dos toques más. Y no se escribe sobre la solicitud: esa es el
-- registro de lo que envió y no se edita. De aquí pasa a la ficha.
-- ---------------------------------------------------------------------------

ALTER TABLE "triage_responses"
  ADD COLUMN "available_days" "Weekday"[],
  ADD COLUMN "available_slots" "DaySlot"[],
  ADD COLUMN "preferred_modality" "PreferredModality";
