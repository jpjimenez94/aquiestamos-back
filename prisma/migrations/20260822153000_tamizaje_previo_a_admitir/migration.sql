-- CreateEnum
CREATE TYPE "TriageDegree" AS ENUM ('SI', 'MAS_O_MENOS', 'NO');

-- CreateEnum
CREATE TYPE "TriageCapacity" AS ENUM ('SI', 'CON_DIFICULTAD', 'NO');

-- CreateEnum
CREATE TYPE "TriageUrgency" AS ENUM ('HOY', 'ESTA_SEMANA', 'PUEDO_ESPERAR');

-- CreateTable
CREATE TABLE "triage_responses" (
    "id" UUID NOT NULL,
    "support_request_id" UUID NOT NULL,
    "safe_place" BOOLEAN NOT NULL,
    "distress" INTEGER NOT NULL,
    "sleep_and_eat" "TriageDegree" NOT NULL,
    "daily_function" "TriageCapacity" NOT NULL,
    "has_support" BOOLEAN NOT NULL,
    "self_harm_thoughts" BOOLEAN NOT NULL,
    "how_soon" "TriageUrgency" NOT NULL,
    "suggested_priority" "CasePriority" NOT NULL,
    "reasons" TEXT[],
    "consent_version" VARCHAR(20) NOT NULL,
    "sensitive_data_consent" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "triage_responses_support_request_id_created_at_idx" ON "triage_responses"("support_request_id", "created_at");

-- CreateIndex
CREATE INDEX "support_requests_status_created_at_idx" ON "support_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "triage_responses" ADD CONSTRAINT "triage_responses_support_request_id_fkey" FOREIGN KEY ("support_request_id") REFERENCES "support_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Reglas que Prisma no sabe expresar en el schema.
-- ---------------------------------------------------------------------------

-- La intensidad es una escala de 1 a 5. Un 0 o un 9 harían que el cálculo de
-- prioridad diera cualquier cosa sin que nada avisara.
ALTER TABLE "triage_responses"
  ADD CONSTRAINT "tamizaje_intensidad_valida" CHECK ("distress" BETWEEN 1 AND 5);

-- Son datos de salud: sin autorización no se guardan. La aplicación también lo
-- valida, pero esto es lo que hace que no exista una fila sin ella.
ALTER TABLE "triage_responses"
  ADD CONSTRAINT "tamizaje_con_autorizacion" CHECK ("sensitive_data_consent" = true);
