-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "confirmed_to_patient_at" TIMESTAMPTZ(3),
ADD COLUMN     "confirmed_to_patient_by" VARCHAR(160),
ADD COLUMN     "confirmed_to_professional_at" TIMESTAMPTZ(3),
ADD COLUMN     "confirmed_to_professional_by" VARCHAR(160);
