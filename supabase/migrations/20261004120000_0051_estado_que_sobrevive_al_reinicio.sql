-- =============================================================================
-- 0051 · ESTADO QUE HOY SE PIERDE AL REINICIAR · ronda 15-R, bloque A
--
-- Tres puertos de la API seguían con su adaptador EN MEMORIA aunque la base
-- existiera (los «adaptadores del Bloque 0.3» del registro de defectos):
--
--   · los códigos de recuperación del segundo factor (RN-20, CA-25): la tabla
--     existe desde la 0026 y nadie escribía en ella; un reinicio dejaba a quien
--     perdió el teléfono sin salida;
--   · los bloqueos de acceso (D-140): un reinicio «desbloqueaba» en la consola
--     un acceso que el equipo sigue teniendo bloqueado;
--   · las operaciones de dispositivo del tablero: la orden atribuida se perdía.
--
-- Esta migración no cambia ninguna tabla que ya se use, salvo añadir a los
-- códigos la columna que distingue «regenerado» de «consumido».
-- =============================================================================

-- ===== 1 · códigos de recuperación: retirar no es consumir ===================
-- Regenerar deja sin valor los anteriores; marcarlos como CONSUMIDOS mezclaría
-- en la auditoría «alguien lo usó» con «se emitió un juego nuevo». Columna
-- propia. «Vigente» es: ni consumido ni retirado.
ALTER TABLE public.codigos_recuperacion_mfa
  ADD COLUMN IF NOT EXISTS retirado_en timestamptz NULL;

CREATE INDEX IF NOT EXISTS codigos_mfa_vigentes_idx
  ON public.codigos_recuperacion_mfa (usuario_id)
  WHERE consumido_en IS NULL AND retirado_en IS NULL;

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.codigos_recuperacion_mfa;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.codigos_recuperacion_mfa
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- La 0026 concedió la tabla SÓLO a `service_role`. El rol de conexión de la API
-- en producción, `app_api`, hereda de `authenticated` (CONEXION_SUPABASE §12):
-- sin esto, el primer código escrito en la base respondía «permission denied».
-- La RLS forzada sigue limitándola al superadministrador (codigos_mfa_superadmin):
-- un usuario normal no lee ni sus propios hashes (lo prueba 99h).
GRANT SELECT, INSERT, UPDATE ON public.codigos_recuperacion_mfa TO authenticated;
REVOKE DELETE, TRUNCATE ON public.codigos_recuperacion_mfa FROM PUBLIC, anon, authenticated, service_role;

-- ===== 2 · bloqueos de acceso: el estado VIGENTE por equipo ===================
-- Una fila por (copropiedad, equipo): lo que quedó la última vez, quién y por
-- qué. Se sobrescribe al fijar otro estado; el rastro histórico de cada orden
-- está en la bitácora estructurada y en la auditoría, no aquí.
CREATE TABLE IF NOT EXISTS public.bloqueos_de_acceso (
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  -- Sin clave ajena, como ordenes_manuales.dispositivo_id: el equipo de
  -- entorno (BARRERA_*) no está en el registro y sigue siendo bloqueable.
  dispositivo_id   uuid NOT NULL,
  bloqueado        boolean NOT NULL,
  motivo           text NOT NULL CHECK (length(motivo) BETWEEN 1 AND 500),
  operador_id      uuid NOT NULL REFERENCES public.usuarios(id),
  rol              text NOT NULL
    CHECK (rol IN ('portero','operador_central','administrador','superadministrador')),
  desde            timestamptz NOT NULL,
  resultado        text NULL CHECK (resultado IS NULL OR resultado IN ('aceptada','rechazada','inalcanzable')),
  detalle          text NULL CHECK (detalle IS NULL OR length(detalle) <= 500),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),
  PRIMARY KEY (copropiedad_id, dispositivo_id)
);
COMMENT ON TABLE public.bloqueos_de_acceso IS
  'D-140 (15-R): el bloqueo VIGENTE de cada acceso, con su dueño, su motivo (RN-08) y '
  'lo que contestó el equipo. Sobrevive al reinicio de la API. Migracion 0051.';

ALTER TABLE public.bloqueos_de_acceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueos_de_acceso FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.bloqueos_de_acceso TO authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.bloqueos_de_acceso FROM PUBLIC, anon, authenticated, service_role;

-- Escribe SÓLO el servicio (la API, que ya validó rol, alcance y motivo): un
-- token de usuario por PostgREST no fija bloqueos saltándose RN-08.
DROP POLICY IF EXISTS bloqueos_de_acceso_lectura   ON public.bloqueos_de_acceso;
DROP POLICY IF EXISTS bloqueos_de_acceso_insercion ON public.bloqueos_de_acceso;
DROP POLICY IF EXISTS bloqueos_de_acceso_edicion   ON public.bloqueos_de_acceso;
CREATE POLICY bloqueos_de_acceso_lectura ON public.bloqueos_de_acceso FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
CREATE POLICY bloqueos_de_acceso_insercion ON public.bloqueos_de_acceso FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));
CREATE POLICY bloqueos_de_acceso_edicion ON public.bloqueos_de_acceso FOR UPDATE
  USING (app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_servicio(copropiedad_id));

DROP TRIGGER IF EXISTS tg_auditoria ON public.bloqueos_de_acceso;
CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.bloqueos_de_acceso
  FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria();
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.bloqueos_de_acceso;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.bloqueos_de_acceso
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- ===== 3 · operaciones de dispositivo: el rastro de cada orden ===============
CREATE TABLE IF NOT EXISTS public.operaciones_de_dispositivo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  dispositivo_id   uuid NOT NULL,
  operacion        text NOT NULL CHECK (operacion IN ('configuracion','sincronizacion','reinicio')),
  -- Hoy ningún ejecutor la saca de «pendiente»: el adaptador declara que no
  -- contacta el equipo (H-SITIO-02). El estado existe para el día que lo haga.
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente')),
  solicitada_por   uuid NOT NULL REFERENCES public.usuarios(id),
  solicitada_en    timestamptz NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id)
);
COMMENT ON TABLE public.operaciones_de_dispositivo IS
  '15-R: las operaciones de configuración, sincronización y reinicio pedidas desde el '
  'tablero, atribuidas y sin borrado. Migracion 0051.';
CREATE INDEX IF NOT EXISTS operaciones_de_dispositivo_pendientes_idx
  ON public.operaciones_de_dispositivo (copropiedad_id, dispositivo_id)
  WHERE estado = 'pendiente';

ALTER TABLE public.operaciones_de_dispositivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operaciones_de_dispositivo FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.operaciones_de_dispositivo TO authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.operaciones_de_dispositivo FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS operaciones_de_dispositivo_lectura   ON public.operaciones_de_dispositivo;
DROP POLICY IF EXISTS operaciones_de_dispositivo_insercion ON public.operaciones_de_dispositivo;
DROP POLICY IF EXISTS operaciones_de_dispositivo_edicion   ON public.operaciones_de_dispositivo;
CREATE POLICY operaciones_de_dispositivo_lectura ON public.operaciones_de_dispositivo FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
CREATE POLICY operaciones_de_dispositivo_insercion ON public.operaciones_de_dispositivo FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));
CREATE POLICY operaciones_de_dispositivo_edicion ON public.operaciones_de_dispositivo FOR UPDATE
  USING (app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_servicio(copropiedad_id));

DROP TRIGGER IF EXISTS tg_auditoria ON public.operaciones_de_dispositivo;
CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.operaciones_de_dispositivo
  FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria();
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.operaciones_de_dispositivo;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.operaciones_de_dispositivo
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- ===== 4 · aserciones ========================================================
DO $$
DECLARE n int; t text;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'codigos_recuperacion_mfa'
     AND column_name = 'retirado_en';
  ASSERT n = 1, '0051: codigos_recuperacion_mfa sin retirado_en';
  FOREACH t IN ARRAY ARRAY['bloqueos_de_acceso', 'operaciones_de_dispositivo'] LOOP
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
     WHERE s.nspname = 'public' AND c.relname = t AND c.relrowsecurity AND c.relforcerowsecurity;
    ASSERT n = 1, format('0051: %s sin RLS forzada', t);
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    ASSERT n = 3, format('0051: %s tiene %s politicas, no 3', t, n);
    SELECT count(*) INTO n FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
     WHERE c.relname = t AND g.tgname IN ('tg_auditoria','tg_prohibir_delete') AND g.tgenabled <> 'D';
    ASSERT n = 2, format('0051: %s sin sus dos disparadores', t);
  END LOOP;
END
$$;
