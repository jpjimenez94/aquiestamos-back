-- «¿Se dio la sesión?», aparte de «¿qué sigue?».
--
-- `outcome` solo admite una respuesta, y el caso más común de todos —la
-- acompañé y de paso quedamos en la siguiente— obligaba a elegir. Se elegía
-- CITA_ACORDADA, y la sesión recién dada no la contaba nadie: el informe de la
-- semana del 29/09 decía 6 sesiones con 10 citas sin cerrar al lado.
--
-- Nulo a propósito en lo ya escrito: a esos profesionales no se les preguntó,
-- y rellenarlo ahora sería inventar sus respuestas.
ALTER TABLE "case_reports" ADD COLUMN "session_held" BOOLEAN;
