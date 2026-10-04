-- Reversión de la migración 0054 (ronda 15-R · E2): el servicio vuelve a no
-- tener lectura propia sobre `usuarios`. Con la API conectada con un rol que
-- omite la RLS no cambia nada; con un rol sujeto a ella, el vínculo del
-- residente deja de resolverse (DT-15K-02 reabierta).
\set ON_ERROR_STOP on
DROP POLICY IF EXISTS usuarios_lectura_servicio ON public.usuarios;
