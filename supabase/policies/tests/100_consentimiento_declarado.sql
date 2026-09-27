-- =============================================================================
-- 100 · CONSENTIMIENTO DECLARADO POR QUIEN REGISTRA · ETAPA 15-L (F4) · ADR-032
--
-- Lo que la BASE sostiene por su cuenta, sin la API delante:
--  · el origen del consentimiento sólo admite sus dos valores, y lo que había
--    antes de la 0043 queda como otorgado por el titular;
--  · una declaración sin autor no entra;
--  · la casilla de la autorización va completa —quién, cuándo, versión— o no va;
--  · la declaración no se salta la unicidad del consentimiento vigente.
-- Con `service_role` (omite RLS): son reglas estructurales, que valen también
-- para la llave secreta. Dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000002"}';

DO $$
DECLARE
  v_cop   uuid := '10000000-0000-4000-8000-000000000001';
  v_actor uuid := '00000000-0000-4000-8000-000000000002';
  v_aut   uuid;
  v_id    uuid;
BEGIN
  -- 1 · lo anterior a la 0043 es del titular ---------------------------------
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.consentimientos_biometricos
     WHERE origen = 'declarado_por_quien_registra' AND declarado_por IS NULL),
    'FALLO: hay una declaración sin autor';

  -- 2 · el origen sólo admite sus dos valores --------------------------------
  BEGIN
    INSERT INTO public.consentimientos_biometricos
      (copropiedad_id, persona_id, version_politica, canal, origen, creado_por, actualizado_por)
    VALUES (v_cop, '40000000-0000-4000-8000-000000000103', 'casilla-v1', 'app',
            'lo_dijo_alguien', v_actor, v_actor);
    RAISE EXCEPTION 'FALLO: entró un origen inventado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3 · una declaración sin autor no entra -----------------------------------
  BEGIN
    INSERT INTO public.consentimientos_biometricos
      (copropiedad_id, persona_id, version_politica, canal, estado, otorgado_en, origen,
       creado_por, actualizado_por)
    VALUES (v_cop, '40000000-0000-4000-8000-000000000103', 'casilla-v1', 'app', 'vigente', now(),
            'declarado_por_quien_registra', v_actor, v_actor);
    RAISE EXCEPTION 'FALLO: entró una declaración sin quien marcó la casilla';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4 · con autor, sí; y la unicidad del vigente sigue mandando ---------------
  INSERT INTO public.consentimientos_biometricos
    (copropiedad_id, persona_id, version_politica, canal, estado, otorgado_en, origen,
     declarado_por, creado_por, actualizado_por)
  VALUES (v_cop, '40000000-0000-4000-8000-000000000103', 'casilla-v1', 'app', 'vigente', now(),
          'declarado_por_quien_registra', v_actor, v_actor, v_actor)
  RETURNING id INTO v_id;
  BEGIN
    INSERT INTO public.consentimientos_biometricos
      (copropiedad_id, persona_id, version_politica, canal, estado, otorgado_en, origen,
       declarado_por, creado_por, actualizado_por)
    VALUES (v_cop, '40000000-0000-4000-8000-000000000103', 'casilla-v1', 'app', 'vigente', now(),
            'declarado_por_quien_registra', v_actor, v_actor, v_actor);
    RAISE EXCEPTION 'FALLO: una segunda declaración abrió otro consentimiento vigente';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 5 · la confirmación del titular cambia el origen y conserva el autor ------
  UPDATE public.consentimientos_biometricos
     SET origen = 'otorgado_por_el_titular'
   WHERE id = v_id;
  ASSERT (SELECT declarado_por FROM public.consentimientos_biometricos WHERE id = v_id) = v_actor,
    'FALLO: la confirmación borró quién había declarado';

  -- 6 · la casilla de la autorización va completa o no va ---------------------
  SELECT id INTO v_aut FROM public.autorizaciones WHERE copropiedad_id = v_cop LIMIT 1;
  ASSERT v_aut IS NOT NULL, 'FALLO: el seed no trae autorizaciones';
  BEGIN
    UPDATE public.autorizaciones
       SET consentimiento_declarado_por = v_actor
     WHERE id = v_aut;
    RAISE EXCEPTION 'FALLO: entró una casilla sin fecha ni versión del texto';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.autorizaciones
       SET consentimiento_declarado_por = v_actor,
           consentimiento_declarado_en  = now(),
           consentimiento_texto_version = ''
     WHERE id = v_aut;
    RAISE EXCEPTION 'FALLO: entró una casilla con la versión del texto vacía';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.autorizaciones
     SET consentimiento_declarado_por = v_actor,
         consentimiento_declarado_en  = now(),
         consentimiento_texto_version = 'casilla-v1'
   WHERE id = v_aut;

  RAISE NOTICE '100 consentimiento declarado: ok';
END
$$;

ROLLBACK;
