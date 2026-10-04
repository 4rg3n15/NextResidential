-- Reversión de la migración 0052 (ronda 15-R · suscripciones Web Push).
--
-- Las suscripciones web dejan de existir como tales: se dan de BAJA (no se
-- borran, RN-19) antes de soltar las columnas, para que ninguna fila web
-- quede activa sin sus llaves. La política vuelve a la de la 0030.
\set ON_ERROR_STOP on

UPDATE public.dispositivos_de_notificacion
   SET estado = 'inactivo', desactivado_en = COALESCE(desactivado_en, now())
 WHERE clave_p256dh IS NOT NULL AND estado = 'activo';

DROP POLICY IF EXISTS dispositivos_notificacion_propios ON public.dispositivos_de_notificacion;
CREATE POLICY dispositivos_notificacion_propios
  ON public.dispositivos_de_notificacion
  FOR ALL
  USING (
    app.es_servicio(copropiedad_id)
    OR (copropiedad_id = app.copropiedad_id() AND usuario_id = app.usuario_id())
  )
  WITH CHECK (
    app.es_servicio(copropiedad_id)
    OR (copropiedad_id = app.copropiedad_id() AND usuario_id = app.usuario_id())
  );

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.dispositivos_de_notificacion;
DROP INDEX IF EXISTS public.dispositivos_notificacion_web_por_vivienda_idx;
DROP INDEX IF EXISTS public.dispositivos_notificacion_endpoint_vivo_uk;
ALTER TABLE public.dispositivos_de_notificacion
  DROP CONSTRAINT IF EXISTS dispositivos_notificacion_motivo_de_baja_len,
  DROP CONSTRAINT IF EXISTS dispositivos_notificacion_web_push_completa,
  DROP CONSTRAINT IF EXISTS dispositivos_notificacion_vivienda_fk,
  DROP COLUMN IF EXISTS motivo_de_baja,
  DROP COLUMN IF EXISTS clave_auth,
  DROP COLUMN IF EXISTS clave_p256dh,
  DROP COLUMN IF EXISTS vivienda_id;
