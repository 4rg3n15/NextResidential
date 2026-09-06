-- Reversión de 0005
DROP FUNCTION IF EXISTS app.es_mi_vivienda(uuid);
DROP TABLE IF EXISTS public.listas_negras CASCADE;
DROP TABLE IF EXISTS public.visitantes CASCADE;
DROP TABLE IF EXISTS public.vehiculos CASCADE;
DROP TABLE IF EXISTS public.residentes CASCADE;
DROP TABLE IF EXISTS public.niveles_acceso CASCADE;
DROP TABLE IF EXISTS public.viviendas CASCADE;
DROP TABLE IF EXISTS public.personas CASCADE;
