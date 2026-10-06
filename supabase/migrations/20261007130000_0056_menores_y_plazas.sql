-- =============================================================================
-- 0056 · RONDA 15-W · MENORES DEL HOGAR Y PLAZAS DEL TITULAR
--
-- Decisiones del cliente D-W2 y D-W10 (docs/auditoria/contradicciones-y-
-- supuestos.md §3 quinquies) · ADR-038 · supuesto S-15W-03.
--
--   1 · tipo_documento: 'tarjeta_identidad' y 'registro_civil', los documentos
--       de un menor en Colombia. Precedente: 0034. Los valores nuevos NO se
--       usan en esta migración (un valor añadido no se puede usar en la misma
--       transacción).
--   2 · plazas_de_ocupante.persona_id: una plaza la ocupa una CUENTA (adulto) o
--       una PERSONA SIN CUENTA (menor), nunca las dos. Una plaza libre es la
--       que no tiene ni la una ni la otra.
--   3 · el disparador de las plazas, ampliado: un adulto con cuenta de ESA
--       vivienda ocupa o libera una plaza libre con una persona sin cuenta de su
--       vivienda; el TITULAR (primer residente) añade plazas y retira las
--       libres; todo lo demás sigue siendo del superadministrador.
--   4 · el TOPE de plazas por vivienda (4 por omisión, ampliable por vivienda),
--       garantizado en la base con un bloqueo por vivienda, como el tope de
--       vehículos de la 0038 (ADR-04, ADR-026). Antes de crear el disparador,
--       las viviendas que YA tienen más de 4 plazas reciben su propio tope: nadie
--       pierde una plaza.
--
-- Idempotente y sin órdenes de psql (scripts/lib/migraciones-sin-psql.mjs).
-- Reversión: supabase/reversion/0056_revert.sql.
-- =============================================================================

-- 1 · documentos de un menor ---------------------------------------------------
ALTER TYPE public.tipo_documento ADD VALUE IF NOT EXISTS 'tarjeta_identidad';
ALTER TYPE public.tipo_documento ADD VALUE IF NOT EXISTS 'registro_civil';

-- 2 · la persona sin cuenta que ocupa una plaza --------------------------------
ALTER TABLE public.plazas_de_ocupante ADD COLUMN IF NOT EXISTS persona_id uuid NULL;
ALTER TABLE public.plazas_de_ocupante DROP CONSTRAINT IF EXISTS plazas_persona_fk;
ALTER TABLE public.plazas_de_ocupante ADD CONSTRAINT plazas_persona_fk
  FOREIGN KEY (copropiedad_id, persona_id) REFERENCES public.personas(copropiedad_id, id);
ALTER TABLE public.plazas_de_ocupante DROP CONSTRAINT IF EXISTS plazas_cuenta_o_persona;
ALTER TABLE public.plazas_de_ocupante ADD CONSTRAINT plazas_cuenta_o_persona
  CHECK (num_nonnulls(usuario_id, persona_id) <= 1);
-- Una persona ocupa como mucho una plaza viva, como una cuenta (plazas_usuario_uk).
CREATE UNIQUE INDEX IF NOT EXISTS plazas_persona_uk
  ON public.plazas_de_ocupante (persona_id) WHERE estado = 'activo' AND persona_id IS NOT NULL;
COMMENT ON COLUMN public.plazas_de_ocupante.persona_id IS
  'D-W2 · ADR-038 · la persona SIN cuenta (un menor) que ocupa la plaza. Una plaza la ocupa una '
  'cuenta o una persona, nunca las dos; libre = ninguna de las dos.';

-- 3 · quién cambia las plazas ---------------------------------------------------
-- Sin claims (migraciones, semillas, el dueño) y el superadministrador: todo.
-- Con claims de servicio, la API actúa EN NOMBRE de `app.usuario_id()`:
--  · INSERT: una plaza nace sin persona; tras la declaración, sólo el TITULAR
--    añade (D-W10). El tope lo impone `tg_tope_de_plazas`, no este.
--  · UPDATE de estado: sólo el titular, sólo de activa a inactiva, sólo una
--    plaza LIBRE y nunca la 1 (la del titular).
--  · UPDATE de persona: ocupar una plaza libre con una persona sin cuenta,
--    MENOR de edad y residente de ESA vivienda, lo hace un adulto con cuenta de
--    ella; liberarla también, o la propia persona al reclamar su plaza con su
--    cuenta (traspaso, S-15W-05).
--  · Nunca cambian la vivienda, el número ni la copropiedad.
CREATE OR REPLACE FUNCTION app.tg_plazas_solo_superadministrador()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_titular    boolean;
  v_adulto     boolean;
  v_nacimiento date;
BEGIN
  IF app.usuario_id() IS NULL OR app.rol() = 'superadministrador' THEN
    RETURN NEW;
  END IF;
  v_titular := EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                        WHERE o.vivienda_id = NEW.vivienda_id
                          AND o.primer_residente_id = app.usuario_id());

  IF TG_OP = 'INSERT' THEN
    IF NEW.persona_id IS NOT NULL THEN
      RAISE EXCEPTION 'Una plaza nace libre: la ocupa después un adulto de la vivienda (D-W2)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT v_titular AND EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                                  WHERE o.vivienda_id = NEW.vivienda_id
                                    AND o.declarada_en IS NOT NULL) THEN
      RAISE EXCEPTION 'Sólo el titular de la vivienda o el superadministrador añaden plazas (D-W10)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.vivienda_id IS DISTINCT FROM OLD.vivienda_id
     OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.copropiedad_id IS DISTINCT FROM OLD.copropiedad_id THEN
    RAISE EXCEPTION 'Una plaza no cambia de vivienda ni de número (D6)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT v_titular OR OLD.estado <> 'activo' OR NEW.estado <> 'inactivo' OR OLD.numero = 1
       OR OLD.usuario_id IS NOT NULL OR OLD.persona_id IS NOT NULL THEN
      RAISE EXCEPTION 'Sólo el titular retira una plaza libre, y nunca la suya (D-W10)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.persona_id IS DISTINCT FROM OLD.persona_id THEN
    v_adulto := EXISTS (
      SELECT 1 FROM public.usuarios u
        JOIN public.residentes r ON r.persona_id = u.persona_id
       WHERE u.id = app.usuario_id() AND u.estado = 'activo'
         AND r.copropiedad_id = NEW.copropiedad_id AND r.vivienda_id = NEW.vivienda_id
         AND r.estado = 'activo');
    IF NEW.persona_id IS NOT NULL THEN
      IF NOT v_adulto OR OLD.usuario_id IS NOT NULL OR OLD.persona_id IS NOT NULL
         OR NEW.usuario_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.persona_id = NEW.persona_id)
         OR NOT EXISTS (SELECT 1 FROM public.residentes r
                         WHERE r.persona_id = NEW.persona_id AND r.vivienda_id = NEW.vivienda_id
                           AND r.copropiedad_id = NEW.copropiedad_id AND r.estado = 'activo') THEN
        RAISE EXCEPTION 'Una plaza libre la ocupa un adulto de la vivienda con una persona sin cuenta de ella (D-W2)'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- Sin cuenta, sólo un MENOR con su fecha (D-W2): un mayor de edad crea su
      -- propia cuenta con un código de plaza. Fecha desconocida → se niega.
      SELECT p.fecha_nacimiento INTO v_nacimiento FROM public.personas p
       WHERE p.id = NEW.persona_id AND p.copropiedad_id = NEW.copropiedad_id;
      IF NOT app.es_menor_de_edad(v_nacimiento) THEN
        RAISE EXCEPTION 'Una persona mayor de edad crea su propia cuenta con un código de plaza (D-W2)'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'plazas_persona_menor';
      END IF;
    -- Liberarla: un adulto la deja LIBRE (sin pasarla a otra cuenta); o la
    -- persona, ya con su cuenta, la reclama para esa cuenta (traspaso).
    ELSIF NOT ((v_adulto AND NEW.usuario_id IS NULL)
               OR EXISTS (SELECT 1 FROM public.usuarios u
                           WHERE u.id = NEW.usuario_id AND u.persona_id = OLD.persona_id
                             AND u.estado = 'activo')) THEN
      RAISE EXCEPTION 'Una plaza la libera un adulto de la vivienda, o la persona al reclamarla (D-W2)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_plazas_solo_superadministrador ON public.plazas_de_ocupante;
CREATE TRIGGER tg_plazas_solo_superadministrador BEFORE INSERT OR UPDATE ON public.plazas_de_ocupante
  FOR EACH ROW EXECUTE FUNCTION app.tg_plazas_solo_superadministrador();

-- 4 · el tope de plazas por vivienda (D-W10, S-15W-03) -------------------------
ALTER TABLE public.copropiedades
  ADD COLUMN IF NOT EXISTS tope_de_plazas_por_vivienda smallint NOT NULL DEFAULT 4;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_tope_de_plazas;
ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_tope_de_plazas
  CHECK (tope_de_plazas_por_vivienda BETWEEN 1 AND 20);
COMMENT ON COLUMN public.copropiedades.tope_de_plazas_por_vivienda IS
  'D-W10 · S-15W-03 · plazas ACTIVAS por vivienda, contando la del titular (4 por omisión). Lo '
  'cambia sólo el superadministrador.';

ALTER TABLE public.viviendas ADD COLUMN IF NOT EXISTS tope_de_plazas smallint NULL;
ALTER TABLE public.viviendas DROP CONSTRAINT IF EXISTS viviendas_tope_de_plazas;
ALTER TABLE public.viviendas ADD CONSTRAINT viviendas_tope_de_plazas
  CHECK (tope_de_plazas IS NULL OR tope_de_plazas BETWEEN 1 AND 20);
COMMENT ON COLUMN public.viviendas.tope_de_plazas IS
  'D-W10 · el tope propio de ESTA vivienda; NULL = el de su copropiedad. Lo amplía sólo el '
  'superadministrador.';

-- Plazas activas de una vivienda: la cuenta que comparten los disparadores.
CREATE OR REPLACE FUNCTION app.plazas_activas(p_vivienda uuid)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer FROM public.plazas_de_ocupante
   WHERE vivienda_id = p_vivienda AND estado = 'activo'
$$;

-- Los dos topes son de PLATAFORMA: la política de edición de `viviendas` (0014)
-- deja al administrador editar sus viviendas por la REST, y sin esto podría
-- subir el tope. Sin claims (migraciones, semillas, el dueño) no aplica.
--
-- Y NADIE —tampoco el superadministrador— deja una vivienda con menos tope que
-- plazas activas (D4 bis): bajo el MISMO bloqueo por vivienda que el alta de una
-- plaza, así que un alta simultánea no se cuela entre la cuenta y el cambio.
-- Una función por tabla: PL/pgSQL no deja nombrar en una expresión un campo
-- que la fila de la otra tabla no tiene.
CREATE OR REPLACE FUNCTION app.tg_tope_de_plazas_de_la_vivienda()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cambia  boolean;
  v_tope    integer;
  v_activas integer;
BEGIN
  -- El superadministrador entra a `viviendas` SÓLO por su tope (política
  -- viviendas_tope_plataforma, abajo): el resto de la fila sigue siendo del
  -- administrador de la copropiedad, como la semilla explica (HU-36).
  IF TG_OP = 'UPDATE' AND app.rol() = 'superadministrador'
     AND (to_jsonb(NEW) - ARRAY['tope_de_plazas', 'actualizado_en', 'actualizado_por'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['tope_de_plazas', 'actualizado_en', 'actualizado_por']) THEN
    RAISE EXCEPTION 'De una vivienda, el superadministrador sólo cambia el tope de plazas (D-W10)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_cambia := NEW.tope_de_plazas IS NOT NULL;
  ELSE
    v_cambia := NEW.tope_de_plazas IS DISTINCT FROM OLD.tope_de_plazas;
  END IF;
  IF NOT v_cambia THEN
    RETURN NEW;
  END IF;
  IF app.usuario_id() IS NOT NULL AND app.rol() IS DISTINCT FROM 'superadministrador' THEN
    RAISE EXCEPTION 'El tope de plazas de una vivienda lo cambia sólo el superadministrador (D-W10)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ncr:tope-plazas:' || NEW.id::text, 0));
    SELECT COALESCE(NEW.tope_de_plazas, c.tope_de_plazas_por_vivienda) INTO v_tope
      FROM public.copropiedades c WHERE c.id = NEW.copropiedad_id;
    v_activas := app.plazas_activas(NEW.id);
    IF v_activas > COALESCE(v_tope, 0) THEN
      RAISE EXCEPTION 'La vivienda tiene % plaza(s) activa(s): su tope no puede quedar en % (D-W10)',
                      v_activas, COALESCE(v_tope, 0)
        USING ERRCODE = 'check_violation', CONSTRAINT = 'viviendas_tope_bajo_las_plazas';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_tope_de_plazas_de_la_vivienda ON public.viviendas;
CREATE TRIGGER tg_tope_de_plazas_de_la_vivienda BEFORE INSERT OR UPDATE ON public.viviendas
  FOR EACH ROW EXECUTE FUNCTION app.tg_tope_de_plazas_de_la_vivienda();

-- La edición de `viviendas` es del administrador (0014). D-W10 da al
-- superadministrador el tope de una vivienda concreta: con una base que aplica
-- la RLS (modo Supabase), sin esta política su cambio no alcanzaría la fila. El
-- disparador de arriba la estrecha a esa columna.
DROP POLICY IF EXISTS viviendas_tope_plataforma ON public.viviendas;
CREATE POLICY viviendas_tope_plataforma ON public.viviendas FOR UPDATE
  USING (app.es_superadmin()) WITH CHECK (app.es_superadmin());
COMMENT ON POLICY viviendas_tope_plataforma ON public.viviendas IS
  'D-W10 · ADR-038 · el superadministrador cambia el tope de plazas de una vivienda, y sólo eso '
  '(lo estrecha app.tg_tope_de_plazas_de_la_vivienda).';

CREATE OR REPLACE FUNCTION app.tg_tope_de_plazas_de_la_copropiedad()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tope_de_plazas_por_vivienda IS DISTINCT FROM OLD.tope_de_plazas_por_vivienda
     AND app.usuario_id() IS NOT NULL AND app.rol() IS DISTINCT FROM 'superadministrador' THEN
    RAISE EXCEPTION 'El tope de plazas de la copropiedad lo cambia sólo el superadministrador (D-W10)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_tope_de_plazas_de_la_copropiedad ON public.copropiedades;
CREATE TRIGGER tg_tope_de_plazas_de_la_copropiedad BEFORE UPDATE ON public.copropiedades
  FOR EACH ROW EXECUTE FUNCTION app.tg_tope_de_plazas_de_la_copropiedad();

-- NADIE PIERDE PLAZAS (S-15W-03). Toda vivienda SIN tope propio que tenga más
-- plazas activas que el tope de su copropiedad recibe un tope propio igual a
-- las que tiene (hasta 20, la cota de la restricción: las que pasaran de 20
-- conservan sus plazas, pero no suman más). La llama esta migración una vez,
-- y el disparador de abajo cada vez que el tope de una copropiedad BAJA.
-- Devuelve cuántas viviendas tocó: el informe de la ronda anota ese número.
CREATE OR REPLACE FUNCTION app.conservar_plazas_sobre_el_tope(p_copropiedad uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  WITH activas AS (
    SELECT p.vivienda_id, count(*) AS n
      FROM public.plazas_de_ocupante p
     WHERE p.estado = 'activo' AND (p_copropiedad IS NULL OR p.copropiedad_id = p_copropiedad)
     GROUP BY p.vivienda_id)
  UPDATE public.viviendas v
     SET tope_de_plazas = LEAST(a.n, 20)::smallint
    FROM activas a, public.copropiedades c
   WHERE v.id = a.vivienda_id AND c.id = v.copropiedad_id
     AND v.tope_de_plazas IS NULL AND a.n > c.tope_de_plazas_por_vivienda;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;

CREATE OR REPLACE FUNCTION app.tg_conservar_plazas_al_bajar_el_tope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app.conservar_plazas_sobre_el_tope(NEW.id);
  RETURN NULL;
END
$$;
DROP TRIGGER IF EXISTS tg_conservar_plazas_al_bajar_el_tope ON public.copropiedades;
CREATE TRIGGER tg_conservar_plazas_al_bajar_el_tope
  AFTER UPDATE OF tope_de_plazas_por_vivienda ON public.copropiedades
  FOR EACH ROW WHEN (NEW.tope_de_plazas_por_vivienda < OLD.tope_de_plazas_por_vivienda)
  EXECUTE FUNCTION app.tg_conservar_plazas_al_bajar_el_tope();

-- Con la identidad de plataforma, como la 0038: la RLS forzada alcanza también
-- al dueño, y sin claims la cuenta vería cero plazas y no conservaría nada.
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador', 'usuario_id', app.actor_de_sistema(),
                      'copropiedad_id', NULL)::text, true);
  n := app.conservar_plazas_sobre_el_tope(NULL);
  RAISE NOTICE '0056: % vivienda(s) con más plazas que el tope por omisión conservan las suyas', n;
END
$$;

-- EL TOPE, EN LA BASE. Un bloqueo consultivo POR VIVIENDA, de transacción, antes
-- de contar: la segunda alta espera a que la primera confirme y, como en READ
-- COMMITTED cada sentencia del disparador toma su propia instantánea, la cuenta
-- ya la incluye. Es el patrón de la 0038 y no un `SELECT … FOR UPDATE` sobre
-- `viviendas` [CONTRADICCIÓN] C-59: ese bloqueo exige que la política de EDICIÓN
-- de viviendas deje pasar a quien inserta, y la API inserta plazas como servicio
-- en nombre del titular, que no edita viviendas. Sin tope legible (NULL) se
-- niega: falla cerrado. Vale también para el superadministrador: su ruta sube
-- antes el tope de la vivienda si hace falta, en la misma transacción.
--
-- Cuenta también la plaza que REVIVE (inactiva → activa): ninguna ruta lo hace,
-- pero un tope que se salta con un UPDATE no es un tope. Como la 0038, que
-- vigila INSERT y UPDATE.
--
-- En un INSERT de varias filas (la declaración inicial), la función —VOLÁTIL—
-- ve las filas que la misma sentencia ya insertó: la que pasa del tope cae.
CREATE OR REPLACE FUNCTION app.tg_tope_de_plazas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tope    smallint;
  v_activas integer;
BEGIN
  IF NEW.estado <> 'activo' OR (TG_OP = 'UPDATE' AND OLD.estado = 'activo') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ncr:tope-plazas:' || NEW.vivienda_id::text, 0));
  SELECT COALESCE(v.tope_de_plazas, c.tope_de_plazas_por_vivienda) INTO v_tope
    FROM public.viviendas v
    JOIN public.copropiedades c ON c.id = v.copropiedad_id
   WHERE v.id = NEW.vivienda_id AND v.copropiedad_id = NEW.copropiedad_id;
  SELECT count(*) INTO v_activas
    FROM public.plazas_de_ocupante p
   WHERE p.copropiedad_id = NEW.copropiedad_id AND p.vivienda_id = NEW.vivienda_id
     AND p.estado = 'activo' AND p.id <> NEW.id;
  IF v_activas >= COALESCE(v_tope, 0) THEN
    RAISE EXCEPTION 'La vivienda ya tiene % plaza(s) y su tope es % (D-W10)',
                    v_activas, COALESCE(v_tope, 0)
      USING ERRCODE = 'check_violation', CONSTRAINT = 'plazas_tope';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_tope_de_plazas ON public.plazas_de_ocupante;
CREATE TRIGGER tg_tope_de_plazas BEFORE INSERT OR UPDATE OF estado ON public.plazas_de_ocupante
  FOR EACH ROW EXECUTE FUNCTION app.tg_tope_de_plazas();

-- 5 · aserciones de despliegue --------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.plazas_de_ocupante'::regclass AND tgenabled <> 'D'
     AND tgname IN ('tg_tope_de_plazas', 'tg_plazas_solo_superadministrador');
  ASSERT n = 2, '0056: faltan los disparadores del tope o de las plazas';
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'plazas_persona_uk';
  ASSERT n = 1, '0056: falta el índice único de la persona que ocupa una plaza';
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgenabled <> 'D'
     AND ((tgrelid = 'public.viviendas'::regclass AND tgname = 'tg_tope_de_plazas_de_la_vivienda')
       OR (tgrelid = 'public.copropiedades'::regclass
           AND tgname IN ('tg_tope_de_plazas_de_la_copropiedad', 'tg_conservar_plazas_al_bajar_el_tope')));
  ASSERT n = 3, '0056: faltan los disparadores de los topes de plataforma';
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'viviendas' AND policyname = 'viviendas_tope_plataforma';
  ASSERT n = 1, '0056: falta la política del tope de plataforma en viviendas';
END
$$;
