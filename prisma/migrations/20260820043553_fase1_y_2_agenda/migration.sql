-- CreateEnum
CREATE TYPE "ProfessionalStatus" AS ENUM ('PENDIENTE_VALIDACION', 'ACTIVO', 'PAUSADO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('NUEVO', 'EN_ADMISION', 'ASIGNADO', 'EN_ACOMPANAMIENTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVA', 'CERRADA');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PROGRAMADA', 'CONFIRMADA', 'REALIZADA', 'CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA');

-- CreateTable
CREATE TABLE "professionals" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "volunteer_id" UUID,
    "full_name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "city" VARCHAR(160) NOT NULL,
    "profession" VARCHAR(160) NOT NULL,
    "years_experience" "YearsExperience",
    "professional_card" "ProfessionalCardStatus",
    "populations" TEXT[],
    "modality" "Modality" NOT NULL,
    "travels_to" VARCHAR(200),
    "status" "ProfessionalStatus" NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
    "max_active_cases" INTEGER NOT NULL DEFAULT 3,
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "support_request_id" UUID,
    "full_name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "email" VARCHAR(160),
    "city" VARCHAR(160) NOT NULL,
    "for_whom" "ForWhom",
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "contact_name" VARCHAR(160),
    "relationship" VARCHAR(120),
    "preferred_contact" "PreferredContact",
    "preferred_modality" "PreferredModality",
    "status" "PatientStatus" NOT NULL DEFAULT 'NUEVO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_assignments" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVA',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "close_reason" VARCHAR(300),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "case_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "modality" "Modality" NOT NULL DEFAULT 'AMBAS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "case_assignment_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 30,
    "blocks_until" TIMESTAMPTZ(3),
    "modality" "Modality" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PROGRAMADA',
    "rescheduled_to_id" UUID,
    "cancel_reason" VARCHAR(300),
    "cancelled_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professionals_user_id_key" ON "professionals"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_volunteer_id_key" ON "professionals"("volunteer_id");

-- CreateIndex
CREATE INDEX "professionals_status_idx" ON "professionals"("status");

-- CreateIndex
CREATE INDEX "professionals_city_idx" ON "professionals"("city");

-- CreateIndex
CREATE INDEX "professionals_deleted_at_idx" ON "professionals"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "patients_support_request_id_key" ON "patients"("support_request_id");

-- CreateIndex
CREATE INDEX "patients_status_idx" ON "patients"("status");

-- CreateIndex
CREATE INDEX "patients_city_idx" ON "patients"("city");

-- CreateIndex
CREATE INDEX "patients_created_at_idx" ON "patients"("created_at");

-- CreateIndex
CREATE INDEX "patients_deleted_at_idx" ON "patients"("deleted_at");

-- CreateIndex
CREATE INDEX "case_assignments_professional_id_status_idx" ON "case_assignments"("professional_id", "status");

-- CreateIndex
CREATE INDEX "case_assignments_patient_id_status_idx" ON "case_assignments"("patient_id", "status");

-- CreateIndex
CREATE INDEX "availability_rules_professional_id_weekday_idx" ON "availability_rules"("professional_id", "weekday");

-- CreateIndex
CREATE INDEX "availability_exceptions_professional_id_starts_at_idx" ON "availability_exceptions"("professional_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_rescheduled_to_id_key" ON "appointments"("rescheduled_to_id");

-- CreateIndex
CREATE INDEX "appointments_professional_id_starts_at_idx" ON "appointments"("professional_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_starts_at_idx" ON "appointments"("patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_assignment_id_fkey" FOREIGN KEY ("case_assignment_id") REFERENCES "case_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduled_to_id_fkey" FOREIGN KEY ("rescheduled_to_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Reglas de negocio que Prisma no sabe expresar en el schema y que por eso se
-- escriben a mano. Están probadas una por una contra esta misma base.
--
-- La aplicación también las valida, pero la última palabra la tiene PostgreSQL:
-- si dos agendadores confirman a la vez, ninguna validación en JavaScript lo
-- evita porque los dos leen la agenda libre antes de que el otro escriba.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- --- 1. Una sesión dura al menos 45 minutos ---------------------------------

ALTER TABLE "appointments"
  ADD CONSTRAINT "cita_rango_valido" CHECK ("ends_at" > "starts_at");

ALTER TABLE "appointments"
  ADD CONSTRAINT "cita_duracion_minima"
  CHECK ("ends_at" >= "starts_at" + interval '45 minutes');

ALTER TABLE "appointments"
  ADD CONSTRAINT "cita_descanso_no_negativo" CHECK ("buffer_minutes" >= 0);

-- --- 2. El descanso de 30 minutos después de cada sesión ---------------------
--
-- `timestamptz + interval` es STABLE, no IMMUTABLE, así que no se puede usar
-- dentro de un índice. Por eso `blocks_until` es una columna real que mantiene
-- un disparador: así la restricción de exclusión trabaja sobre una columna
-- normal y el valor no depende de que la aplicación lo calcule bien.

CREATE OR REPLACE FUNCTION calcular_bloqueo_cita() RETURNS trigger AS $$
BEGIN
  NEW."blocks_until" := NEW."ends_at" + make_interval(mins => NEW."buffer_minutes");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "citas_calcular_bloqueo"
  BEFORE INSERT OR UPDATE ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION calcular_bloqueo_cita();

-- Rellena la columna en las filas que ya existan (ninguna, la primera vez).
UPDATE "appointments" SET "buffer_minutes" = "buffer_minutes";

ALTER TABLE "appointments" ALTER COLUMN "blocks_until" SET NOT NULL;

-- --- 3. Sin dobles reservas -------------------------------------------------
--
-- El rango del profesional incluye el descanso, así que una cita que empiece
-- antes de que termine el descanso de la anterior choca. El `WHERE` deja fuera
-- las canceladas: cancelar libera la franja de inmediato.

ALTER TABLE "appointments"
  ADD CONSTRAINT "cita_sin_solape_profesional"
  EXCLUDE USING gist (
    "professional_id" WITH =,
    tstzrange("starts_at", "blocks_until", '[)') WITH &&
  ) WHERE ("status" IN ('PROGRAMADA', 'CONFIRMADA'));

-- Al paciente no se le aplica el descanso: es tiempo de trabajo del profesional.
ALTER TABLE "appointments"
  ADD CONSTRAINT "cita_sin_solape_paciente"
  EXCLUDE USING gist (
    "patient_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('PROGRAMADA', 'CONFIRMADA'));

-- --- 4. Un profesional por paciente -----------------------------------------
--
-- Un paciente solo tiene una asignación activa a la vez. Un profesional sí
-- puede llevar varios pacientes.

CREATE UNIQUE INDEX "un_profesional_activo_por_paciente"
  ON "case_assignments" ("patient_id")
  WHERE ("status" = 'ACTIVA' AND "deleted_at" IS NULL);

-- --- 5. Franjas de disponibilidad coherentes --------------------------------

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "franja_dentro_del_dia"
  CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute");

-- La franja tiene que dar para al menos una sesión con su descanso.
ALTER TABLE "availability_rules"
  ADD CONSTRAINT "franja_cabe_una_sesion"
  CHECK ("end_minute" - "start_minute" >= 45);

ALTER TABLE "availability_exceptions"
  ADD CONSTRAINT "bloqueo_rango_valido" CHECK ("ends_at" > "starts_at");

-- --- 6. Cupo de casos coherente ---------------------------------------------

ALTER TABLE "professionals"
  ADD CONSTRAINT "cupo_positivo" CHECK ("max_active_cases" >= 0);
