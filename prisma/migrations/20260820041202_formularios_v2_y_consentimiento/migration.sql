-- CreateEnum
CREATE TYPE "YearsExperience" AS ENUM ('MENOS_DE_1', 'ENTRE_1_Y_3', 'ENTRE_3_Y_5', 'MAS_DE_5');

-- CreateEnum
CREATE TYPE "WeeklyHours" AS ENUM ('ENTRE_1_Y_3', 'ENTRE_4_Y_6', 'MAS_DE_6', 'VARIABLE');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO');

-- CreateEnum
CREATE TYPE "DaySlot" AS ENUM ('MANANA', 'TARDE', 'NOCHE');

-- CreateEnum
CREATE TYPE "ForWhom" AS ENUM ('PARA_MI', 'PARA_OTRA_PERSONA');

-- CreateEnum
CREATE TYPE "PreferredContact" AS ENUM ('WHATSAPP', 'LLAMADA', 'CORREO');

-- CreateEnum
CREATE TYPE "PreferredModality" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'INDIFERENTE');

-- AlterTable
ALTER TABLE "support_requests" ADD COLUMN     "available_days" "Weekday"[],
ADD COLUMN     "available_slots" "DaySlot"[],
ADD COLUMN     "city" VARCHAR(160),
ADD COLUMN     "communications_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consent_version" VARCHAR(20),
ADD COLUMN     "contact_name" VARCHAR(160),
ADD COLUMN     "for_whom" "ForWhom",
ADD COLUMN     "guardian_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_minor" BOOLEAN,
ADD COLUMN     "preferred_contact" "PreferredContact",
ADD COLUMN     "preferred_modality" "PreferredModality",
ADD COLUMN     "relationship" VARCHAR(120),
ADD COLUMN     "sensitive_data_consent" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "place" DROP NOT NULL,
ALTER COLUMN "availability" DROP NOT NULL;

-- AlterTable
ALTER TABLE "volunteers" ADD COLUMN     "additional_training" VARCHAR(400),
ADD COLUMN     "available_days" "Weekday"[],
ADD COLUMN     "available_slots" "DaySlot"[],
ADD COLUMN     "city" VARCHAR(160),
ADD COLUMN     "communications_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consent_version" VARCHAR(20),
ADD COLUMN     "profession" VARCHAR(160),
ADD COLUMN     "sensitive_data_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weekly_hours" "WeeklyHours",
ADD COLUMN     "years_experience" "YearsExperience",
ALTER COLUMN "training" DROP NOT NULL,
ALTER COLUMN "residence" DROP NOT NULL,
ALTER COLUMN "yellow_fever_vaccine" DROP NOT NULL;
