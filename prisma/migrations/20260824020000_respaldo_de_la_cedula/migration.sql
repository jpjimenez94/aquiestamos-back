-- La cedula tiene informacion por ambas caras. El respaldo es opcional:
-- un PDF con ambas caras no lo necesita.

ALTER TABLE "professionals" ADD COLUMN "identity_document_back_url" VARCHAR(500);
