-- La encuesta breve tras el cierre: el unico dato de resultado que la red
-- tiene. Dos preguntas, opcional, por enlace con token. Una por asignacion.

CREATE TYPE "EncuestaAyuda" AS ENUM ('SI', 'ALGO', 'NO');

CREATE TABLE "closure_surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "helped" "EncuestaAyuda" NOT NULL,
    "would_recommend" BOOLEAN NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closure_surveys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "closure_surveys_assignment_id_key" ON "closure_surveys"("assignment_id");

ALTER TABLE "closure_surveys" ADD CONSTRAINT "closure_surveys_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
