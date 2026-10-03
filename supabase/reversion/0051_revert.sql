-- Reversión de la migración 0051 (ronda 15-R · estado que sobrevive al reinicio).
--
-- Pierde los bloqueos vigentes guardados y el rastro de las operaciones de
-- dispositivo: la API vuelve a sus adaptadores en memoria (un reinicio los
-- borra). De los códigos de recuperación se pierde la distinción «retirado»:
-- antes de soltar la columna, los retirados se marcan como consumidos, para
-- que un juego regenerado NO vuelva a ser válido al revertir.
\set ON_ERROR_STOP on

UPDATE public.codigos_recuperacion_mfa
   SET consumido_en = retirado_en
 WHERE retirado_en IS NOT NULL AND consumido_en IS NULL;
DROP INDEX IF EXISTS public.codigos_mfa_vigentes_idx;
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.codigos_recuperacion_mfa;
ALTER TABLE public.codigos_recuperacion_mfa DROP COLUMN IF EXISTS retirado_en;
REVOKE SELECT, INSERT, UPDATE ON public.codigos_recuperacion_mfa FROM authenticated;

DROP TABLE IF EXISTS public.operaciones_de_dispositivo;
DROP TABLE IF EXISTS public.bloqueos_de_acceso;
