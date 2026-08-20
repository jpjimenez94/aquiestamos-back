-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "blocks_until" DROP NOT NULL;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "available_days" "Weekday"[],
ADD COLUMN     "available_slots" "DaySlot"[];
