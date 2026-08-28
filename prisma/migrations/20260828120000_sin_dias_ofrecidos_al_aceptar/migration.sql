-- Se van los días y franjas que el profesional escribía al aceptar un caso.
--
-- Le pedían por segunda vez algo que ya nos había dado: su disponibilidad está
-- cargada desde que se registró, y de los 48 profesionales asignables, los 48
-- la tienen. Encima se lo pedíamos en el paso donde más se moría el proceso —de
-- cada ocho asignaciones, siete se perdían esperando esa respuesta— así que el
-- formulario estaba justo donde debía haber un botón.
--
-- Con esto, la agenda del profesional queda como ÚNICA fuente de cuándo puede,
-- y la persona elige de ella desde su propio enlace.
--
-- Es un DROP y por tanto no se deshace: lo que había en esas dos columnas eran
-- 36 filas de negociaciones ya cerradas o vencidas. Ninguna asignación viva las
-- usa para nada que no esté también en la agenda del profesional.

ALTER TABLE "case_assignments" DROP COLUMN "accepted_days",
DROP COLUMN "accepted_slots";
