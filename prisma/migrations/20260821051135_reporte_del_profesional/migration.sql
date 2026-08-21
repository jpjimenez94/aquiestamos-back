-- CreateEnum
CREATE TYPE "CaseOutcome" AS ENUM ('CITA_ACORDADA', 'YA_ATENDIDA', 'NO_CONTESTA', 'DATOS_ERRADOS', 'NO_QUIERE', 'SIGO_INTENTANDO', 'OTRO');

-- CreateTable
CREATE TABLE "case_reports" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "outcome" "CaseOutcome" NOT NULL,
    "modality" "Modality",
    "meets_at" TIMESTAMPTZ(3),
    "contact_difficulties" VARCHAR(600),
    "notes" VARCHAR(1000),
    "reported_by_email" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_reports_assignment_id_created_at_idx" ON "case_reports"("assignment_id", "created_at");

-- AddForeignKey
ALTER TABLE "case_reports" ADD CONSTRAINT "case_reports_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
