-- Cuándo confirmó el profesional por última vez que su agenda sigue al día.
--
-- Asignar sin preguntar se apoya en que esa agenda sea de verdad: si está
-- vieja, se manda a alguien a una hora en la que él ya no está. Null = nunca
-- confirmó, y entonces cuenta su fecha de registro, que es cuando la cargó.
ALTER TABLE "professionals" ADD COLUMN "availability_confirmed_at" TIMESTAMPTZ(3);
