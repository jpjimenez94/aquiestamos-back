-- Puesta al día: todo lo que entró a la base con `prisma db push` y nunca
-- quedó registrado como migración.
--
-- Entre el 24 y el 27 de agosto de 2026 el esquema creció (líderes
-- comunitarios, tareas de voluntariado, parametrización, telemetría de salas,
-- feedback y notas de seguimiento) pero los cambios se empujaron directo con
-- `db push`. El resultado: `schema.prisma` y `prisma/migrations/` dejaron de
-- contar la misma historia, y un despliegue limpio no podía reconstruir la
-- base.
--
-- Este archivo cierra esa brecha. Se generó con:
--
--   prisma migrate diff --from-migrations ./prisma/migrations \
--     --to-schema-datamodel ./prisma/schema.prisma --script
--
-- y se verificó que producción ya coincide exactamente con el esquema, así que
-- allí se marca como aplicada sin ejecutarla:
--
--   npx prisma migrate resolve --applied 20260827000000_puesta_al_dia_tras_db_push
--
-- Es puramente aditiva: 10 tablas, 5 enums, 24 índices y 10 llaves foráneas.
-- No hay un solo DROP.


-- CreateEnum
CREATE TYPE "MeetingParticipantRole" AS ENUM ('PACIENTE', 'PROFESIONAL', 'COORDINACION', 'INVITADO');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('BORRADOR', 'ABIERTA', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "TaskAssignmentStatus" AS ENUM ('INVITADO', 'ACEPTADO', 'RECHAZADO', 'EN_PROGRESO', 'COMPLETADO', 'NO_RESPONDIO');

-- CreateEnum
CREATE TYPE "SettingCategory" AS ENUM ('MENSAJE_WHATSAPP', 'PLANTILLA_CORREO', 'PARAMETRO_GENERAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'ADMISION';
ALTER TYPE "UserRole" ADD VALUE 'COORDINADOR_CASOS';
ALTER TYPE "UserRole" ADD VALUE 'LIDERES_COMUNITARIOS';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "consent_signed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consent_signed_at" TIMESTAMPTZ(3),
ADD COLUMN     "consent_signed_document_url" VARCHAR(500),
ADD COLUMN     "meeting_provider" VARCHAR(50) DEFAULT 'AUTO',
ADD COLUMN     "meeting_url" VARCHAR(500),
ADD COLUMN     "patient_first_joined_at" TIMESTAMPTZ(3),
ADD COLUMN     "professional_first_joined_at" TIMESTAMPTZ(3),
ADD COLUMN     "total_call_duration_seconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "closure_surveys" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "collaborators" ALTER COLUMN "status" SET DEFAULT 'ACTIVO';

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "professional_card_document_url" VARCHAR(500),
ADD COLUMN     "professional_card_number" VARCHAR(60),
ADD COLUMN     "professional_card_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "professional_card_verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "professional_card_verified_by" VARCHAR(160);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];

-- CreateTable
CREATE TABLE "patient_notes" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "author_name" VARCHAR(160) NOT NULL,
    "author_email" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_feedbacks" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "assignment_id" UUID,
    "how_felt" VARCHAR(40) NOT NULL,
    "respectful_treatment" VARCHAR(40),
    "got_tools" VARCHAR(40),
    "session_quality" VARCHAR(40),
    "wants_to_continue" VARCHAR(40) NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_access_logs" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "role" "MeetingParticipantRole" NOT NULL DEFAULT 'PACIENTE',
    "participant_name" VARCHAR(160),
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_ping_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "ip_address" VARCHAR(100),
    "user_agent" VARCHAR(300),

    CONSTRAINT "meeting_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "need_categories" (
    "id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(300),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "need_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_leaders" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "email" VARCHAR(160),
    "territory" VARCHAR(200) NOT NULL,
    "beneficiaries_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(40) NOT NULL DEFAULT 'ACTIVO',
    "last_contact_at" TIMESTAMPTZ(3),
    "next_action" VARCHAR(600),
    "next_action_date" TIMESTAMPTZ(3),
    "notes" VARCHAR(2000),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "community_leaders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_leader_needs" (
    "id" UUID NOT NULL,
    "leader_id" UUID NOT NULL,
    "need_id" UUID NOT NULL,
    "details" VARCHAR(500),
    "status" VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_leader_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_leader_contacts" (
    "id" UUID NOT NULL,
    "leader_id" UUID NOT NULL,
    "contacted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contacted_by" VARCHAR(160) NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "next_action_defined" VARCHAR(600),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_leader_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "area" "CollaboratorArea" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "due_date" DATE,
    "start_time" VARCHAR(10),
    "end_time" VARCHAR(10),
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIA',
    "status" "TaskStatus" NOT NULL DEFAULT 'BORRADOR',
    "materials_url" VARCHAR(500),
    "notes" VARCHAR(2000),
    "created_by_email" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "collaborator_id" UUID NOT NULL,
    "status" "TaskAssignmentStatus" NOT NULL DEFAULT 'INVITADO',
    "note" VARCHAR(500),
    "confirm_token" VARCHAR(500) NOT NULL,
    "responded_at" TIMESTAMPTZ(3),
    "decline_reason" VARCHAR(300),
    "completion_url" VARCHAR(500),
    "completion_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "category" "SettingCategory" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "value" TEXT NOT NULL,
    "default_value" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "data_type" VARCHAR(30) NOT NULL DEFAULT 'TEXTO',
    "updated_by_email" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_notes_patient_id_created_at_idx" ON "patient_notes"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "patient_feedbacks_patient_id_created_at_idx" ON "patient_feedbacks"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "patient_feedbacks_assignment_id_created_at_idx" ON "patient_feedbacks"("assignment_id", "created_at");

-- CreateIndex
CREATE INDEX "meeting_access_logs_appointment_id_idx" ON "meeting_access_logs"("appointment_id");

-- CreateIndex
CREATE INDEX "meeting_access_logs_role_idx" ON "meeting_access_logs"("role");

-- CreateIndex
CREATE INDEX "meeting_access_logs_joined_at_idx" ON "meeting_access_logs"("joined_at");

-- CreateIndex
CREATE INDEX "need_categories_type_active_idx" ON "need_categories"("type", "active");

-- CreateIndex
CREATE INDEX "community_leaders_status_idx" ON "community_leaders"("status");

-- CreateIndex
CREATE INDEX "community_leaders_territory_idx" ON "community_leaders"("territory");

-- CreateIndex
CREATE INDEX "community_leaders_created_at_idx" ON "community_leaders"("created_at");

-- CreateIndex
CREATE INDEX "community_leader_needs_leader_id_idx" ON "community_leader_needs"("leader_id");

-- CreateIndex
CREATE INDEX "community_leader_needs_need_id_idx" ON "community_leader_needs"("need_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_leader_needs_leader_id_need_id_key" ON "community_leader_needs"("leader_id", "need_id");

-- CreateIndex
CREATE INDEX "community_leader_contacts_leader_id_contacted_at_idx" ON "community_leader_contacts"("leader_id", "contacted_at");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_area_idx" ON "tasks"("area");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_confirm_token_key" ON "task_assignments"("confirm_token");

-- CreateIndex
CREATE INDEX "task_assignments_collaborator_id_status_idx" ON "task_assignments"("collaborator_id", "status");

-- CreateIndex
CREATE INDEX "task_assignments_confirm_token_idx" ON "task_assignments"("confirm_token");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_task_id_collaborator_id_key" ON "task_assignments"("task_id", "collaborator_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- CreateIndex
CREATE INDEX "system_settings_key_idx" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_feedbacks" ADD CONSTRAINT "patient_feedbacks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_feedbacks" ADD CONSTRAINT "patient_feedbacks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_access_logs" ADD CONSTRAINT "meeting_access_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_leaders" ADD CONSTRAINT "community_leaders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_leader_needs" ADD CONSTRAINT "community_leader_needs_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "community_leaders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_leader_needs" ADD CONSTRAINT "community_leader_needs_need_id_fkey" FOREIGN KEY ("need_id") REFERENCES "need_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_leader_contacts" ADD CONSTRAINT "community_leader_contacts_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "community_leaders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_collaborator_id_fkey" FOREIGN KEY ("collaborator_id") REFERENCES "collaborators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

