-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "unreachable_by" VARCHAR(160),
ADD COLUMN     "unreachable_last_at" TIMESTAMPTZ(3),
ADD COLUMN     "unreachable_reason" VARCHAR(40),
ADD COLUMN     "unreachable_since" TIMESTAMPTZ(3),
ADD COLUMN     "unreachable_tries" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "patients_unreachable_since_idx" ON "patients"("unreachable_since");
