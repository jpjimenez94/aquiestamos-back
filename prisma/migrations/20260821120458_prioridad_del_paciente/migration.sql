-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "priority" "CasePriority" NOT NULL DEFAULT 'MEDIA';

-- CreateIndex
CREATE INDEX "patients_status_priority_idx" ON "patients"("status", "priority");
