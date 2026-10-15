-- =============================================================================
-- 0058 · TOPES POR OMISIÓN: 5 VEHÍCULOS PROPIOS Y 10 PLAZAS POR VIVIENDA
--        RONDA 15-Z1 · D-Z1 · D-Z2 (decisiones del cliente, 2026-10-13)
--
-- Dos valores por omisión cambian; ningún tope deja de ser configurable:
--   · `copropiedades.tope_vehiculos_propios`: 2 → 5 (0038, ADR-026). Se cuenta
--     POR VIVIENDA, como lo cuenta `app.tg_tope_vehiculos_propios` desde la
--     0038 (`[CONTRADICCIÓN]` C-67: el encargo lo dice «por residente»; la
--     unidad NO cambia aquí, P-40).
--   · `copropiedades.tope_de_plazas_por_vivienda`: 4 → 10 (0056, D-W10).
--
-- Las copropiedades que estaban EXACTAMENTE en el valor por omisión anterior
-- (2 y 4) pasan al nuevo: `[SUPUESTO]` S-15Z1-01, «era el valor por omisión,
-- no una decisión». Las que tienen otro valor (3, 6…) lo decidió alguien y se
-- conservan. Cada cambio deja su fila en `auditoria_seguridad`, con la misma
-- forma que la consola (`cambio_configuracion`), y esa fila es la que hace la
-- migración idempotente —no se repite sobre una copropiedad ya migrada— y
-- reversible (`supabase/reversion/0058_revert.sql` la lee para volver).
-- Los topes propios de cada vivienda (`viviendas.tope_de_plazas`) no se tocan.
--
-- Reversión: supabase/reversion/0058_revert.sql.
-- =============================================================================

-- 1 · los nuevos valores por omisión ------------------------------------------
ALTER TABLE public.copropiedades ALTER COLUMN tope_vehiculos_propios SET DEFAULT 5;
ALTER TABLE public.copropiedades ALTER COLUMN tope_de_plazas_por_vivienda SET DEFAULT 10;

COMMENT ON COLUMN public.copropiedades.tope_vehiculos_propios IS
  'D5 a · ADR-026 · D-Z1 (0058) · vehículos propios ACTIVOS que los ocupantes pueden registrar POR '
  'VIVIENDA (5 por omisión; de 0 a 20). Los que registra el superadministrador no cuentan.';
COMMENT ON COLUMN public.copropiedades.tope_de_plazas_por_vivienda IS
  'D-W10 · D-Z2 (0058) · plazas ACTIVAS por vivienda, contando la del titular (10 por omisión; '
  'de 1 a 20). Lo cambia sólo el superadministrador.';

-- 2 · las copropiedades que estaban en el valor por omisión anterior ---------
-- Función, y no un bloque anónimo, para que la prueba 99n la ejerza sobre
-- datos propios: devuelve cuántos ajustes cambió (vehículos + plazas).
CREATE OR REPLACE FUNCTION app.aplicar_topes_por_omision_0058(p_copropiedad uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  c        record;
  v_actor  uuid := app.actor_de_sistema();
  v_total  integer := 0;
BEGIN
  FOR c IN
    SELECT id, tope_vehiculos_propios, tope_de_plazas_por_vivienda
      FROM public.copropiedades
     WHERE (p_copropiedad IS NULL OR id = p_copropiedad)
       AND (tope_vehiculos_propios = 2 OR tope_de_plazas_por_vivienda = 4)
     ORDER BY id
  LOOP
    IF c.tope_vehiculos_propios = 2 AND NOT EXISTS (
         SELECT 1 FROM public.auditoria_seguridad a
          WHERE a.copropiedad_id_objetivo = c.id
            AND a.identificador_solicitado LIKE 'migración 0058 · topeVehiculosPropios%') THEN
      UPDATE public.copropiedades
         SET tope_vehiculos_propios = 5, actualizado_en = now(), actualizado_por = v_actor
       WHERE id = c.id;
      INSERT INTO public.auditoria_seguridad
        (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
         identificador_solicitado, resultado, creado_por)
      VALUES
        (NULL, c.id, v_actor, 'cambio_configuracion', 'copropiedades/' || c.id::text || '/configuracion',
         'migración 0058 · topeVehiculosPropios: 2 → 5 (D-Z1) · [SUPUESTO] S-15Z1-01: era el valor '
         'por omisión, no una decisión', 'permitido', v_actor);
      v_total := v_total + 1;
    END IF;
    IF c.tope_de_plazas_por_vivienda = 4 AND NOT EXISTS (
         SELECT 1 FROM public.auditoria_seguridad a
          WHERE a.copropiedad_id_objetivo = c.id
            AND a.identificador_solicitado LIKE 'migración 0058 · topeDePlazasPorVivienda%') THEN
      UPDATE public.copropiedades
         SET tope_de_plazas_por_vivienda = 10, actualizado_en = now(), actualizado_por = v_actor
       WHERE id = c.id;
      INSERT INTO public.auditoria_seguridad
        (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
         identificador_solicitado, resultado, creado_por)
      VALUES
        (NULL, c.id, v_actor, 'cambio_configuracion', 'copropiedades/' || c.id::text || '/configuracion',
         'migración 0058 · topeDePlazasPorVivienda: 4 → 10 (D-Z2) · [SUPUESTO] S-15Z1-01: era el '
         'valor por omisión, no una decisión', 'permitido', v_actor);
      v_total := v_total + 1;
    END IF;
  END LOOP;
  RETURN v_total;
END
$$;
REVOKE EXECUTE ON FUNCTION app.aplicar_topes_por_omision_0058(uuid) FROM PUBLIC;
COMMENT ON FUNCTION app.aplicar_topes_por_omision_0058(uuid) IS
  '0058 · D-Z1/D-Z2 · lleva al nuevo valor por omisión las copropiedades que estaban en el anterior '
  '(2 vehículos, 4 plazas), con una fila de auditoría por cambio que la hace idempotente. '
  'Devuelve cuántos ajustes cambió.';

-- Con la identidad de plataforma, como la 0056: la RLS forzada alcanza también
-- al dueño, y los disparadores de los dos topes exigen superadministrador
-- cuando hay un usuario en los claims.
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador', 'usuario_id', app.actor_de_sistema(),
                      'copropiedad_id', NULL)::text, true);
  n := app.aplicar_topes_por_omision_0058(NULL);
  RAISE NOTICE '0058: % ajuste(s) de copropiedad pasaron del valor por omisión anterior al nuevo', n;
END
$$;

-- ── Aserciones de despliegue ────────────────────────────────────────────────
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v
    FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.copropiedades'::regclass AND a.attname = 'tope_vehiculos_propios';
  ASSERT v = '5', format('0058: tope_vehiculos_propios con DEFAULT %s, no 5', v);
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v
    FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.copropiedades'::regclass AND a.attname = 'tope_de_plazas_por_vivienda';
  ASSERT v = '10', format('0058: tope_de_plazas_por_vivienda con DEFAULT %s, no 10', v);
  ASSERT NOT EXISTS (SELECT 1 FROM public.copropiedades
                      WHERE tope_vehiculos_propios = 2 OR tope_de_plazas_por_vivienda = 4),
         '0058: queda una copropiedad en el valor por omisión anterior sin migrar';
END
$$;
