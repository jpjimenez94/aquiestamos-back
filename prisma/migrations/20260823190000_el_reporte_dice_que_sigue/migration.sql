-- El reporte del profesional gana la pregunta que faltaba para poder cerrar:
-- que sigue despues de la sesion. Y un resultado nuevo: "teniamos sesion y no
-- se presento", que no es lo mismo que "no contesta".

ALTER TYPE "CaseOutcome" ADD VALUE 'NO_ASISTIO';

CREATE TYPE "CaseFollowUp" AS ENUM ('NECESITA_MAS', 'SUFICIENTE', 'NO_SABE');

ALTER TABLE "case_reports" ADD COLUMN "follow_up" "CaseFollowUp";
