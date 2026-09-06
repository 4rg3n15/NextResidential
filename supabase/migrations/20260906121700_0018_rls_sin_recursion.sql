-- =============================================================================
-- 0018 · Recursión infinita en la política de `residentes` · RLS · FORCE
--
-- HALLAZGO del 2026-09-06, encontrado por el arnés de verificación fiel
-- (`verificar.sh --modo-supabase`), que aplica el esquema con un rol dueño NO
-- superusuario, como el `postgres` de Supabase gestionado.
--
-- SÍNTOMA: «stack depth limit exceeded», con la pila llena de
-- `es_mi_vivienda → es_mi_vivienda → …`.
--
-- EL CICLO:
--   política `residentes_lectura_residente` sobre `residentes`
--     → app.puede_leer_residente()
--       → app.es_mi_vivienda()
--         → SELECT ... FROM public.residentes      ← vuelve a la política
--
-- POR QUÉ NO SE VEÍA. `es_mi_vivienda` es SECURITY DEFINER, y esa marca se
-- eligió creyendo que evitaba la RLS. NO la evita: todas las tablas llevan
-- FORCE ROW LEVEL SECURITY, y `FORCE` aplica las políticas TAMBIÉN AL DUEÑO.
-- SECURITY DEFINER solo cambia CON QUÉ identidad corre la función, no si la RLS
-- se aplica. Lo único que la evita es un rol con BYPASSRLS o un superusuario —
-- y la base local corría precisamente como superusuario, así que la recursión
-- nunca llegó a producirse. En Supabase habría estallado en cuanto un residente
-- consultara sus datos.
--
-- LA CORRECCIÓN. No se toca `es_mi_vivienda`: sigue siendo el predicado correcto
-- para las tablas que cuelgan de una vivienda (`vehiculos`, `autorizaciones`…),
-- donde no hay ciclo. Lo que se corrige es la política SOBRE `residentes`, que
-- es el único punto donde el predicado se pregunta por la misma tabla que está
-- filtrando. Ahí la pregunta «¿es mía esta vivienda?» sobra: la fila de
-- `residentes` YA dice de quién es, y se resuelve contra los claims sin leer
-- nada. La política deja de ser recursiva porque deja de ser indirecta.
--
-- No se debilita el aislamiento: se exige la misma copropiedad y la misma
-- persona que antes, y se sigue restringiendo al rol `residente`.
-- =============================================================================

DROP POLICY IF EXISTS residentes_lectura_residente ON public.residentes;

CREATE POLICY residentes_lectura_residente ON public.residentes FOR SELECT
  USING (
    app.rol() = 'residente'
    AND copropiedad_id = app.copropiedad_id()
    AND persona_id     = app.persona_id()
  );

COMMENT ON POLICY residentes_lectura_residente ON public.residentes IS
  'El residente ve SU propia fila de padron. Se resuelve contra los claims y no '
  'contra la tabla: usar app.es_mi_vivienda() aqui produce recursion infinita '
  'porque esa funcion lee `residentes` y FORCE RLS reevalua esta politica '
  '(migracion 0018).';

-- Verificación: la recursión se declara resuelta si la política ya no invoca,
-- ni directa ni indirectamente, una función que lea `residentes`.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'residentes'
     AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(es_mi_vivienda|puede_leer_residente)';
  IF n > 0 THEN
    RAISE EXCEPTION
      'Recursion de RLS: % politicas de `residentes` siguen invocando un predicado que lee `residentes`', n;
  END IF;
  RAISE NOTICE 'RLS de `residentes` sin recursion: ok';
END
$$;
