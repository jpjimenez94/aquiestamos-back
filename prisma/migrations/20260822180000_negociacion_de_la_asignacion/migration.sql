-- ---------------------------------------------------------------------------
-- Los estados nuevos de la negociación, y NADA MÁS.
--
-- Va sola en su migración porque PostgreSQL no deja USAR un valor de enum
-- recién creado dentro de la misma transacción que lo creó, y Prisma envuelve
-- cada migración en una. Poner aquí el `DEFAULT 'PROPUESTA'` la hace fallar
-- entera con "unsafe use of new value".
-- ---------------------------------------------------------------------------

ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'PROPUESTA';
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'ACEPTADA';
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'RECHAZADA';
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'CANCELADA';
