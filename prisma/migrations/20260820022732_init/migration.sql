-- CreateEnum
CREATE TYPE "CrisisExperience" AS ENUM ('SI', 'NO', 'FORMACION_POCA_PRACTICA', 'SIN_FORMACION_DISPONIBLE_APRENDER');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'AMBAS');

-- CreateEnum
CREATE TYPE "YellowFeverStatus" AS ENUM ('SI', 'NO', 'CITA_AGENDADA');

-- CreateEnum
CREATE TYPE "ProfessionalCardStatus" AS ENUM ('SI', 'EN_TRAMITE', 'ESTUDIANTE');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NUEVO', 'EN_REVISION', 'CONTACTADO', 'ACTIVO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "volunteers" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "populations" TEXT[],
    "population_other" VARCHAR(200),
    "training" VARCHAR(300) NOT NULL,
    "crisis_experience" "CrisisExperience" NOT NULL,
    "modality" "Modality" NOT NULL,
    "residence" VARCHAR(160) NOT NULL,
    "available_to_travel" VARCHAR(200),
    "yellow_fever_vaccine" "YellowFeverStatus" NOT NULL,
    "availability" TEXT[],
    "professional_card" "ProfessionalCardStatus" NOT NULL,
    "data_consent" BOOLEAN NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NUEVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_requests" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "place" VARCHAR(160) NOT NULL,
    "availability" VARCHAR(300) NOT NULL,
    "message" VARCHAR(1000),
    "data_consent" BOOLEAN NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NUEVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "resource_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(600) NOT NULL,
    "collection" VARCHAR(120) NOT NULL DEFAULT 'Cuentos infantiles',
    "cover_image" VARCHAR(300) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "icon" VARCHAR(60) NOT NULL DEFAULT 'sparkle',
    "position" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volunteers_email_idx" ON "volunteers"("email");

-- CreateIndex
CREATE INDEX "volunteers_created_at_idx" ON "volunteers"("created_at");

-- CreateIndex
CREATE INDEX "support_requests_created_at_idx" ON "support_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "resource_categories_slug_key" ON "resource_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "resources_slug_key" ON "resources"("slug");

-- CreateIndex
CREATE INDEX "resources_category_id_idx" ON "resources"("category_id");

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "resource_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
