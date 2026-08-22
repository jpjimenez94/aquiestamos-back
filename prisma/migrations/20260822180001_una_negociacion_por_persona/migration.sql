-- ---------------------------------------------------------------------------
-- La asignación deja de ser un hecho y pasa a ser una negociación.
--
-- Antes: elegir profesional creaba la asignación en ACTIVA y ahí terminaba.
-- El tablero decía "asignado" cuando nadie había aceptado nada todavía, y el
-- estado real —"se lo propuse el martes y estoy esperando"— vivía en la
-- cabeza de quien coordinaba y en su historial de WhatsApp.
--
-- Las filas que ya existen se quedan como están: ACTIVA sigue significando
-- exactamente lo mismo que significaba, un acompañamiento en curso.
-- ---------------------------------------------------------------------------

ALTER TABLE "case_assignments"
  ADD COLUMN "responded_at" TIMESTAMPTZ(3),
  ADD COLUMN "accepted_days" "Weekday"[],
  ADD COLUMN "accepted_slots" "DaySlot"[],
  ADD COLUMN "availability_note" VARCHAR(600),
  ADD COLUMN "decline_reason" VARCHAR(300),
  ADD COLUMN "patient_confirmed_at" TIMESTAMPTZ(3);

-- Proponer un caso no es asignarlo: lo que nace, nace como propuesta.
ALTER TABLE "case_assignments" ALTER COLUMN "status" SET DEFAULT 'PROPUESTA';

-- ---------------------------------------------------------------------------
-- El índice que impedía dos asignaciones ACTIVAS por persona pasa a cubrir
-- todos los estados en los que la negociación sigue abierta.
--
-- Sin esto, se le pueden proponer dos profesionales a la vez a la misma
-- persona y acabar con dos que aceptan. Para proponerle el caso a otro hay que
-- cerrar el actual —rechazarlo o cancelarlo— y eso debe costar un gesto
-- explícito: si no, nadie se entera de que el primero nunca contestó.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "un_profesional_activo_por_paciente";

CREATE UNIQUE INDEX "una_negociacion_abierta_por_paciente"
  ON "case_assignments" ("patient_id")
  WHERE ("status" IN ('PROPUESTA', 'ACEPTADA', 'ACTIVA') AND "deleted_at" IS NULL);
