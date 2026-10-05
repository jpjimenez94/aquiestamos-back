-- CreateTable
CREATE TABLE "case_withdrawals" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "assignment_id" UUID,
    "signed_name" VARCHAR(160) NOT NULL,
    "text_version" VARCHAR(20) NOT NULL,
    "text_snapshot" TEXT NOT NULL,
    "reason" VARCHAR(600),
    "signed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(100),
    "user_agent" VARCHAR(300),
    "requested_by" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_withdrawals_patient_id_idx" ON "case_withdrawals"("patient_id");

-- CreateIndex
CREATE INDEX "case_withdrawals_signed_at_idx" ON "case_withdrawals"("signed_at");

-- AddForeignKey
ALTER TABLE "case_withdrawals" ADD CONSTRAINT "case_withdrawals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_withdrawals" ADD CONSTRAINT "case_withdrawals_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
