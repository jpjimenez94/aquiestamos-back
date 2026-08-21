-- CreateEnum
CREATE TYPE "CollaboratorArea" AS ENUM ('SALUD', 'SOCIAL_LEGAL_EDUCATIVO', 'OPERACION_LOGISTICA', 'COMUNICACION_TECNOLOGIA', 'GESTION_PROYECTOS', 'OTRA');

-- CreateTable
CREATE TABLE "collaborators" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "city" VARCHAR(160) NOT NULL,
    "area" "CollaboratorArea" NOT NULL,
    "discipline" VARCHAR(120) NOT NULL,
    "discipline_other" VARCHAR(160),
    "years_experience" "YearsExperience",
    "professional_card" "ProfessionalCardStatus",
    "skills" VARCHAR(600),
    "modality" "Modality" NOT NULL,
    "available_to_travel" VARCHAR(200),
    "available_days" "Weekday"[],
    "available_slots" "DaySlot"[],
    "weekly_hours" "WeeklyHours",
    "yellow_fever_vaccine" "YellowFeverStatus",
    "consent_version" VARCHAR(20),
    "data_consent" BOOLEAN NOT NULL,
    "sensitive_data_consent" BOOLEAN NOT NULL DEFAULT false,
    "communications_consent" BOOLEAN NOT NULL DEFAULT false,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NUEVO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collaborators_email_idx" ON "collaborators"("email");

-- CreateIndex
CREATE INDEX "collaborators_area_idx" ON "collaborators"("area");

-- CreateIndex
CREATE INDEX "collaborators_city_idx" ON "collaborators"("city");

-- CreateIndex
CREATE INDEX "collaborators_created_at_idx" ON "collaborators"("created_at");

-- CreateIndex
CREATE INDEX "collaborators_deleted_at_idx" ON "collaborators"("deleted_at");
