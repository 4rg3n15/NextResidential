-- Reversión de la migración 0053 (ronda 15-R · puerta libre y bloqueada).
--
-- Se NIEGA si queda alguna puerta libre o bloqueada sin revertir: sin la
-- tabla, el barrido no sabría que hay que devolverla a su modo normal y la
-- puerta quedaría así indefinidamente. Revierta antes desde la consola.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.ordenes_de_modo_de_puerta u
     WHERE u.modo <> 'normal' AND u.resultado IS DISTINCT FROM 'rechazada'
       AND NOT EXISTS (
         SELECT 1 FROM public.ordenes_de_modo_de_puerta n
          WHERE n.copropiedad_id = u.copropiedad_id AND n.dispositivo_id = u.dispositivo_id
            AND n.numero_de_puerta = u.numero_de_puerta AND n.modo = 'normal'
            AND n.resultado = 'aceptada' AND n.secuencia > u.secuencia)) THEN
    RAISE EXCEPTION '0053_revert: hay puertas libres o bloqueadas sin revertir';
  END IF;
END $$;

DROP TABLE IF EXISTS public.ordenes_de_modo_de_puerta;
DROP TABLE IF EXISTS public.ajustes_de_puertas;
DROP FUNCTION IF EXISTS app.tg_orden_de_modo_solo_resultado();
