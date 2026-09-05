-- CreateEnum
CREATE TYPE "CheckInNeed" AS ENUM ('APOYO_PARA_MI', 'AYUDA_CON_UN_CASO', 'DESCARGARME');

-- CreateEnum
CREATE TYPE "GroupSessionStatus" AS ENUM ('PROGRAMADA', 'REALIZADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "supervisor_volunteer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supervisor_volunteer_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "professional_check_ins" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "need" "CheckInNeed" NOT NULL,
    "notes" VARCHAR(1000),
    "question_for_group" VARCHAR(600),
    "sessions_at_check_in" INTEGER NOT NULL,
    "group_session_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_group_sessions" (
    "id" UUID NOT NULL,
    "facilitator_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "meeting_url" VARCHAR(500) NOT NULL,
    "agenda" VARCHAR(4000),
    "status" "GroupSessionStatus" NOT NULL DEFAULT 'PROGRAMADA',
    "created_by_email" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_group_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_group_invitations" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "attended" BOOLEAN,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_group_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professional_check_ins_professional_id_created_at_idx" ON "professional_check_ins"("professional_id", "created_at");

-- CreateIndex
CREATE INDEX "professional_check_ins_group_session_id_idx" ON "professional_check_ins"("group_session_id");

-- CreateIndex
CREATE INDEX "support_group_sessions_starts_at_idx" ON "support_group_sessions"("starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_group_invitations_session_id_professional_id_key" ON "support_group_invitations"("session_id", "professional_id");

-- AddForeignKey
ALTER TABLE "professional_check_ins" ADD CONSTRAINT "professional_check_ins_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_check_ins" ADD CONSTRAINT "professional_check_ins_group_session_id_fkey" FOREIGN KEY ("group_session_id") REFERENCES "support_group_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_group_sessions" ADD CONSTRAINT "support_group_sessions_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_group_invitations" ADD CONSTRAINT "support_group_invitations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "support_group_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_group_invitations" ADD CONSTRAINT "support_group_invitations_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
