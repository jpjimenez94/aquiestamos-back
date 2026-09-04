-- AlterTable
ALTER TABLE "case_assignments" ADD COLUMN     "confirmed_by_email" VARCHAR(160),
ADD COLUMN     "professional_confirmed_at" TIMESTAMPTZ(3);
