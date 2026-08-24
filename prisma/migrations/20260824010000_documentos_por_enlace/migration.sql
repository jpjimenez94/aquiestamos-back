-- El profesional sube sus documentos por su propio enlace: la tarjeta o el
-- certificado, y su documento de identidad. Cuando envio separa "por
-- notificar" de "pendiente de aprobacion".

ALTER TABLE "professionals" ADD COLUMN "identity_document_url" VARCHAR(500);
ALTER TABLE "professionals" ADD COLUMN "documents_submitted_at" TIMESTAMPTZ(3);
