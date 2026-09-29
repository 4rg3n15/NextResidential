-- ─────────────────────────────────────────────────────────────────────────────
-- 0045 · ETAPA 15-M (C6) · UN SECRETO DE ALARM SERVER POR CÁMARA, EMITIDO EN EL ALTA
--
-- Hasta aquí la cámara se acreditaba en `POST /alarm-server/<secreto>` con un
-- secreto escrito A MANO en `ALARM_SERVER_EQUIPOS` del .env de la API: una
-- cámara nueva exigía editar el .env y reiniciar. Con N cámaras eso no escala y
-- contradice la regla del cliente (nada obliga a tocar código ni ficheros en
-- sitio). Ahora la API GENERA el secreto al dar de alta una `camara_lpr`, lo
-- guarda aquí CIFRADO con la misma bóveda que la credencial del equipo
-- (`EQUIPOS_LLAVE`, HKDF por copropiedad, AES-256-GCM) y lo enseña UNA vez.
--
-- Dos columnas y por qué dos:
--  · `secreto_alarm_server_sobre`  — iv ‖ etiqueta ‖ cuerpo, cifrado. Sirve para
--    volver a ESCRIBIR la ruta en la cámara («Enviar eventos a este Mac») sin
--    pedírselo a nadie. Sin la llave maestra es ruido.
--  · `secreto_alarm_server_huella` — HMAC-SHA256 del secreto con una llave
--    derivada de la maestra. Es lo que el receptor BUSCA cuando llega una
--    publicación: secreto → huella → equipo → copropiedad. Un volcado de la base
--    no permite ni recuperar el secreto ni verificar uno adivinado.
--
-- `ALARM_SERVER_EQUIPOS` NO se retira: sigue valiendo (la cámara que funciona
-- hoy no se toca). Las dos fuentes conviven y la declaración manda ante empate.
--
-- Idempotente; reversible con supabase/reversion/0045_revert.sql.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.dispositivos
  ADD COLUMN IF NOT EXISTS secreto_alarm_server_sobre bytea NULL,
  ADD COLUMN IF NOT EXISTS secreto_alarm_server_huella bytea NULL,
  ADD COLUMN IF NOT EXISTS secreto_alarm_server_emitido_en timestamptz NULL;

-- La huella identifica a UN equipo: dos cámaras con el mismo secreto serían
-- indistinguibles y la lectura se atribuiría a la primera que la base devolviera.
CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_secreto_alarm_server_huella_uk
  ON public.dispositivos (secreto_alarm_server_huella)
  WHERE secreto_alarm_server_huella IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'dispositivos_secreto_alarm_server_completo'
       AND conrelid = 'public.dispositivos'::regclass
  ) THEN
    -- O las tres o ninguna: un sobre sin huella no se puede buscar, y una
    -- huella sin sobre no se puede volver a escribir en la cámara.
    ALTER TABLE public.dispositivos
      ADD CONSTRAINT dispositivos_secreto_alarm_server_completo
      CHECK (
        (secreto_alarm_server_sobre IS NULL) = (secreto_alarm_server_huella IS NULL)
        AND (secreto_alarm_server_sobre IS NULL) = (secreto_alarm_server_emitido_en IS NULL)
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.dispositivos.secreto_alarm_server_sobre IS
  'Secreto con el que la cámara publica en /alarm-server, cifrado (iv‖etiqueta‖cuerpo) con la bóveda de EQUIPOS_LLAVE. Emitido por la API en el alta; nunca en claro en la base.';
COMMENT ON COLUMN public.dispositivos.secreto_alarm_server_huella IS
  'HMAC-SHA256 del secreto con llave derivada de EQUIPOS_LLAVE: lo que el receptor busca al acreditar una publicación. No permite recuperar el secreto.';
COMMENT ON COLUMN public.dispositivos.secreto_alarm_server_emitido_en IS
  'Cuándo la API emitió el secreto vigente de la cámara (rotar = volver a emitir).';
