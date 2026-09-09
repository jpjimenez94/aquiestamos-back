-- AlterTable
ALTER TABLE "patient_notes" ADD COLUMN     "edited_at" TIMESTAMPTZ(3),
ADD COLUMN     "edited_by_email" VARCHAR(160),
ADD COLUMN     "edited_by_name" VARCHAR(160);
