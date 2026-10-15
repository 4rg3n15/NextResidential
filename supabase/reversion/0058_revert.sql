-- Reversión de la migración 0058 (ronda 15-Z1 · topes por omisión 5 y 10).
--
-- Devuelve los DEFAULT a 2 y 4 y, en cada copropiedad que la 0058 cambió (lo
-- dice su fila de auditoría) y que SIGUE en el valor nuevo, vuelve al anterior.
-- Una copropiedad que alguien cambió después (p. ej. a 8) se conserva. Cada
-- vuelta deja su propia fila de auditoría.
--
-- ADVERTENCIA: bajar el tope de plazas de 10 a 4 dispara
-- `tg_conservar_plazas_al_bajar_el_tope` (0056): las viviendas con más de 4
-- plazas activas reciben un tope propio igual a las suyas; nadie pierde una
-- plaza. Los vehículos propios ya registrados por encima de 2 se conservan: el
-- tope se aplica al alta, no a lo que existe.
\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE public.copropiedades ALTER COLUMN tope_vehiculos_propios SET DEFAULT 2;
ALTER TABLE public.copropiedades ALTER COLUMN tope_de_plazas_por_vivienda SET DEFAULT 4;

DO $$
DECLARE
  a       record;
  v_actor uuid := app.actor_de_sistema();
  n_v     integer := 0;
  n_p     integer := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador', 'usuario_id', v_actor, 'copropiedad_id', NULL)::text,
    true);
  FOR a IN
    SELECT copropiedad_id_objetivo AS id, identificador_solicitado AS que
      FROM public.auditoria_seguridad
     WHERE identificador_solicitado LIKE 'migración 0058 · %'
       AND copropiedad_id_objetivo NOT IN (
         SELECT copropiedad_id_objetivo FROM public.auditoria_seguridad
          WHERE identificador_solicitado LIKE 'reversión 0058 · %' AND copropiedad_id_objetivo IS NOT NULL)
  LOOP
    IF a.que LIKE 'migración 0058 · topeVehiculosPropios%' THEN
      UPDATE public.copropiedades SET tope_vehiculos_propios = 2, actualizado_en = now(), actualizado_por = v_actor
       WHERE id = a.id AND tope_vehiculos_propios = 5;
      IF FOUND THEN n_v := n_v + 1; END IF;
      INSERT INTO public.auditoria_seguridad
        (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
         identificador_solicitado, resultado, creado_por)
      VALUES (NULL, a.id, v_actor, 'cambio_configuracion', 'copropiedades/' || a.id::text || '/configuracion',
              'reversión 0058 · topeVehiculosPropios: 5 → 2', 'permitido', v_actor);
    ELSIF a.que LIKE 'migración 0058 · topeDePlazasPorVivienda%' THEN
      UPDATE public.copropiedades SET tope_de_plazas_por_vivienda = 4, actualizado_en = now(), actualizado_por = v_actor
       WHERE id = a.id AND tope_de_plazas_por_vivienda = 10;
      IF FOUND THEN n_p := n_p + 1; END IF;
      INSERT INTO public.auditoria_seguridad
        (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
         identificador_solicitado, resultado, creado_por)
      VALUES (NULL, a.id, v_actor, 'cambio_configuracion', 'copropiedades/' || a.id::text || '/configuracion',
              'reversión 0058 · topeDePlazasPorVivienda: 10 → 4', 'permitido', v_actor);
    END IF;
  END LOOP;
  RAISE NOTICE 'reversión 0058: % tope(s) de vehículos y % de plazas volvieron al valor anterior', n_v, n_p;
END
$$;

DROP FUNCTION IF EXISTS app.aplicar_topes_por_omision_0058(uuid);

COMMENT ON COLUMN public.copropiedades.tope_vehiculos_propios IS
  'D5 a · ADR-026 · vehículos propios ACTIVOS que los ocupantes pueden registrar por vivienda. '
  'Los que registra el superadministrador no cuentan.';
COMMENT ON COLUMN public.copropiedades.tope_de_plazas_por_vivienda IS
  'D-W10 · S-15W-03 · plazas ACTIVAS por vivienda, contando la del titular (4 por omisión). Lo '
  'cambia sólo el superadministrador.';

COMMIT;
