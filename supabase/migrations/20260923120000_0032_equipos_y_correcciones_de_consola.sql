-- =============================================================================
-- 0032 · Aprovisionamiento de equipos desde la consola, y tres correcciones
--        que tocan el esquema (ETAPA 15-B)
--
-- Lleva cuatro cosas que van juntas porque comparten tabla o decisión:
--
--   1 · A.1 · los datos de conexión de un equipo se dan de alta desde la
--       consola, y su SECRETO se guarda CIFRADO, no en claro.
--   2 · B.5 · el umbral de confianza de placa y el margen de latido dejan de
--       ser ajustes de pantalla y pasan a constante documentada.
--   3 · B.2 · una vivienda creada por error puede borrarse de verdad, pero
--       SOLO si no tiene historial. El disparador que prohíbe el borrado no se
--       deshabilita: se hace más preciso.
--   4 · A.3 · queda constancia de si el equipo se verificó contra el aparato
--       o se guardó a ciegas.
--
-- Idempotente y reversible en el sentido que admite PostgreSQL.
-- =============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · B.5 · DOS AJUSTES QUE DEJAN DE SERLO
--
-- QUÉ PASA CON LOS VALORES YA GUARDADOS — la pregunta que hay que contestar en
-- la migración y no en el informe. Se NORMALIZAN al valor documentado. La
-- alternativa —dejar el valor de cada copropiedad como esté— produciría el
-- peor de los dos mundos: un número que ya nadie puede cambiar desde ninguna
-- parte, distinto en cada tenant y sin nadie que sepa de dónde salió.
--
-- El umbral queda ADEMÁS fijado por restricción: cambiarlo exige migración,
-- que es exactamente lo que debe costar. El margen de latido NO se fija por
-- restricción, y la asimetría es deliberada: ya lo ata
-- `copropiedades_umbral_latido_coherente` al periodo de latido y a los latidos
-- tolerados (migración 0020). Una segunda restricción sobre la misma columna
-- podría contradecir a la primera, y dos fuentes de verdad que se contradicen
-- son peor que ninguna.
--
-- El respaldo del 0,800: `confidenceLevel` del evento ANPR es un entero 0–100,
-- y 80 es el umbral por debajo del cual la lectura no decide sola (CU-01,
-- excepción 3a). Antes era 0,85 — centésimas sin origen documental.
-- ═════════════════════════════════════════════════════════════════════════════

-- El VALOR POR OMISION tambien cambia. Sin esto, cada copropiedad nueva nace
-- con el 0,850 de la migracion 0004 y choca contra la restriccion de abajo: la
-- primera semilla que se cargue lo demuestra (y lo demostro).
ALTER TABLE public.copropiedades ALTER COLUMN umbral_confianza_placa SET DEFAULT 0.800;

UPDATE public.copropiedades SET umbral_confianza_placa = 0.800
 WHERE umbral_confianza_placa IS DISTINCT FROM 0.800;

UPDATE public.copropiedades SET umbral_latido_dispositivo = interval '5 minutes'
 WHERE umbral_latido_dispositivo IS DISTINCT FROM interval '5 minutes'
   AND interval '5 minutes' > periodo_latido * (latidos_tolerados + 1);

ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_umbral_confianza_fijo;
ALTER TABLE public.copropiedades
  ADD CONSTRAINT copropiedades_umbral_confianza_fijo
  CHECK (umbral_confianza_placa = 0.800);

COMMENT ON COLUMN public.copropiedades.umbral_confianza_placa IS
  'Constante documentada, no ajuste: 0,800 = 80 en la escala 0-100 de '
  'confidenceLevel del evento ANPR. Cambiarlo exige migracion (B.5).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · B.2 · BORRADO DEFINITIVO SOLO DONDE NO HAY HISTORIAL
--
-- RN-19, CA-02 y KPI-04 prohíben el borrado físico **donde hay historial**. El
-- disparador genérico prohibía TODO borrado, que es más de lo que la regla
-- pide y deja sin salida el caso real: «la creé por error hace un minuto».
--
-- No se deshabilita el disparador —eso abriría la puerta entera—: se sustituye
-- en `viviendas` por uno que expresa la regla con precisión. La garantía sigue
-- estando en la base y alcanza al dueño de la tabla, no depende de que el
-- código «no lo haga». Lo que cambia es que ahora el disparador MIRA si hay
-- historial en vez de suponer que siempre lo hay.
--
-- Qué cuenta como historial: un residente, un vehículo, una autorización o un
-- solo evento, activos o no. Un evento basta: es la trazabilidad de un acceso
-- y RN-03 la hace inmutable — una vivienda con eventos no puede desaparecer
-- sin dejar esos eventos apuntando al vacío.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.vivienda_tiene_historial(p_vivienda_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.residentes      WHERE vivienda_id = p_vivienda_id)
      OR EXISTS (SELECT 1 FROM public.vehiculos       WHERE vivienda_id = p_vivienda_id)
      OR EXISTS (SELECT 1 FROM public.autorizaciones  WHERE vivienda_id = p_vivienda_id)
      OR EXISTS (SELECT 1 FROM public.eventos         WHERE vivienda_id = p_vivienda_id);
$$;

COMMENT ON FUNCTION app.vivienda_tiene_historial IS
  'Un residente, un vehiculo, una autorizacion o un solo evento: cualquiera de '
  'los cuatro es historial y bloquea el borrado fisico (RN-19, CA-02).';

CREATE OR REPLACE FUNCTION app.tg_viviendas_prohibir_delete()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.vivienda_tiene_historial(OLD.id) THEN
    RAISE EXCEPTION
      'La vivienda % tiene historial: el borrado fisico esta prohibido. Use la '
      'baja logica (estado = inactivo). RN-19', OLD.identificador
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.viviendas;
DROP TRIGGER IF EXISTS tg_viviendas_prohibir_delete ON public.viviendas;
CREATE TRIGGER tg_viviendas_prohibir_delete BEFORE DELETE ON public.viviendas
  FOR EACH ROW EXECUTE FUNCTION app.tg_viviendas_prohibir_delete();

-- QUIEN puede borrar lo dice la RLS; CUANDO se puede, el disparador. Hasta
-- ahora `viviendas` no tenia politica de DELETE porque el borrado no existia, y
-- sin politica la RLS forzada lo niega tambien al dueno — que es lo correcto
-- mientras no hubiera puerta. Ahora la hay, y la puerta tiene cerradura.
DROP POLICY IF EXISTS viviendas_borrado ON public.viviendas;
CREATE POLICY viviendas_borrado ON public.viviendas FOR DELETE
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));

-- La segunda barrera sigue en pie: `authenticated` y `service_role` NO tienen
-- DELETE sobre `viviendas` (migración 0015, decisión D-20). El borrado pasa
-- por esta función, que se ejecuta como el dueño, vuelve a comprobar el
-- alcance y deja el rastro EN LA MISMA TRANSACCIÓN que el borrado.
CREATE OR REPLACE FUNCTION app.borrar_vivienda_definitivamente(
  p_copropiedad_id uuid,
  p_vivienda_id    uuid,
  p_actor          uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_identificador text;
BEGIN
  SELECT identificador INTO v_identificador
    FROM public.viviendas
   WHERE id = p_vivienda_id AND copropiedad_id = p_copropiedad_id;

  IF v_identificador IS NULL THEN
    RAISE EXCEPTION 'La vivienda no existe en esta copropiedad'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- El disparador lo comprobaría igual; comprobarlo aquí permite que el
  -- mensaje nombre la vivienda y llegue como rechazo de negocio y no como
  -- violacion de restriccion.
  IF app.vivienda_tiene_historial(p_vivienda_id) THEN
    RAISE EXCEPTION
      'La vivienda % tiene historial y no puede borrarse definitivamente', v_identificador
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO public.auditoria_seguridad
    (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
     identificador_solicitado, resultado, creado_por)
  VALUES
    (p_copropiedad_id, p_copropiedad_id, p_actor, 'cambio_configuracion',
     'viviendas/borrado-definitivo', v_identificador, 'permitido', p_actor);

  DELETE FROM public.viviendas
   WHERE id = p_vivienda_id AND copropiedad_id = p_copropiedad_id;
END
$$;

REVOKE EXECUTE ON FUNCTION app.borrar_vivienda_definitivamente(uuid, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app.borrar_vivienda_definitivamente(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · A.1 · DATOS DE CONEXIÓN DEL EQUIPO
--
-- `dispositivos` ya tenía `host`, `puerto` y `credencial_ref`. Faltaba lo que
-- hace falta para HABLAR con el aparato y lo que la consola necesita para
-- mostrarlo con honestidad.
--
-- **El protocolo es HTTP y no HTTPS por omisión**, y no es un descuido: la
-- DS-TCG405-E responde por HTTP, comprobado en sitio. Poner HTTPS por defecto
-- produciría un «no responde» que manda a revisar la red cuando el problema es
-- el esquema. Se deja configurable porque otros modelos sí lo traen.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'protocolo_equipo') THEN
    CREATE TYPE public.protocolo_equipo AS ENUM ('http', 'https');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verificacion_equipo') THEN
    CREATE TYPE public.verificacion_equipo AS ENUM ('no_verificado', 'verificado', 'rechazado');
  END IF;
END
$$;

ALTER TABLE public.dispositivos
  ADD COLUMN IF NOT EXISTS protocolo        public.protocolo_equipo NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS usuario          text NULL,
  ADD COLUMN IF NOT EXISTS canal_barrera    integer NULL,
  ADD COLUMN IF NOT EXISTS numero_de_puerta integer NULL,
  ADD COLUMN IF NOT EXISTS canal_de_audio   integer NULL,
  ADD COLUMN IF NOT EXISTS verificacion     public.verificacion_equipo NOT NULL
                                            DEFAULT 'no_verificado',
  ADD COLUMN IF NOT EXISTS verificado_en    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS motivo_no_verificado text NULL;

ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_usuario_len;
ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_canales_validos;
ALTER TABLE public.dispositivos
  ADD CONSTRAINT dispositivos_usuario_len
    CHECK (usuario IS NULL OR length(usuario) BETWEEN 1 AND 64),
  ADD CONSTRAINT dispositivos_canales_validos
    CHECK ((canal_barrera    IS NULL OR canal_barrera    BETWEEN 1 AND 16)
       AND (numero_de_puerta IS NULL OR numero_de_puerta BETWEEN 1 AND 16)
       AND (canal_de_audio   IS NULL OR canal_de_audio   BETWEEN 1 AND 16));

COMMENT ON COLUMN public.dispositivos.protocolo IS
  'HTTP por omision: la DS-TCG405-E responde por HTTP, verificado en sitio. '
  'HTTPS es opcion, no supuesto (A.1).';
COMMENT ON COLUMN public.dispositivos.verificacion IS
  'Si el alta se comprobo contra el aparato. Guardar un equipo apagado es '
  'legitimo, pero se marca NO VERIFICADO y se dice por que (A.3).';

-- -----------------------------------------------------------------------------
-- El SECRETO del equipo, cifrado
--
-- `dispositivos.credencial_ref` sigue sin admitir una contrasena literal: su
-- CHECK exige la forma `vault:...` o `env:...` (RN-21, D-09b). Lo que faltaba
-- era la boveda a la que apunta `vault:`. Aqui esta, y guarda **el sobre
-- AES-256-GCM**, nunca el texto.
--
-- El sobre es EL MISMO que el de las plantillas biometricas (H-13-02): llave
-- derivada por copropiedad con HKDF, IV de 12 bytes, etiqueta de 16. No hay una
-- segunda forma de cifrar en este proyecto, y esa es la decision: dos cifrados
-- son dos superficies que auditar y dos maneras de equivocarse.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credenciales_de_equipo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id  uuid NOT NULL REFERENCES public.copropiedades(id),
  dispositivo_id  uuid NOT NULL,

  -- El sobre, en tres piezas. `bytea` y no `text`: un volcado entrega bytes
  -- sin sentido, que es justo el punto.
  iv              bytea NOT NULL,
  cuerpo          bytea NOT NULL,
  etiqueta        bytea NOT NULL,
  algoritmo       text  NOT NULL DEFAULT 'aes-256-gcm',
  llave_ref       text  NOT NULL,

  estado          estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en  timestamptz NULL,

  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT credenciales_equipo_fk FOREIGN KEY (copropiedad_id, dispositivo_id)
    REFERENCES public.dispositivos(copropiedad_id, id),
  CONSTRAINT credenciales_equipo_iv_len       CHECK (length(iv) = 12),
  CONSTRAINT credenciales_equipo_etiqueta_len CHECK (length(etiqueta) = 16),
  CONSTRAINT credenciales_equipo_cuerpo_len   CHECK (length(cuerpo) BETWEEN 1 AND 4096),
  -- La referencia a la llave es una REFERENCIA, igual que en plantillas: si
  -- aqui cupiera la llave, cifrar no protegeria del volcado de la base.
  CONSTRAINT credenciales_equipo_llave_es_referencia
    CHECK (llave_ref ~ '^(env|vault):[A-Za-z0-9_./-]+$'),
  CONSTRAINT credenciales_equipo_baja_coherente
    CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL))
);

-- Una sola credencial ACTIVA por equipo. Rotar es desactivar la anterior y
-- escribir la nueva en la misma transaccion: el historial de rotacion se
-- conserva y nunca hay dos vigentes a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS credenciales_equipo_activa_uk
  ON public.credenciales_de_equipo (copropiedad_id, dispositivo_id)
  WHERE estado = 'activo';

COMMENT ON TABLE public.credenciales_de_equipo IS
  'Sobre AES-256-GCM con el secreto del equipo. Nunca texto en claro, nunca '
  'la llave: solo su referencia (RN-21, A.1).';

ALTER TABLE public.credenciales_de_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credenciales_de_equipo FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credenciales_equipo_lectura   ON public.credenciales_de_equipo;
DROP POLICY IF EXISTS credenciales_equipo_insercion ON public.credenciales_de_equipo;
DROP POLICY IF EXISTS credenciales_equipo_edicion   ON public.credenciales_de_equipo;

-- NADIE lee esta tabla con un token de usuario. Ni el superadministrador: la
-- consola no necesita el secreto para nada, y el unico que lo descifra es el
-- proceso que va a hablar con el equipo, que usa la llave secreta de servicio.
CREATE POLICY credenciales_equipo_lectura ON public.credenciales_de_equipo FOR SELECT
  USING (app.es_servicio(copropiedad_id));
CREATE POLICY credenciales_equipo_insercion ON public.credenciales_de_equipo FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
              OR app.es_servicio(copropiedad_id));
CREATE POLICY credenciales_equipo_edicion ON public.credenciales_de_equipo FOR UPDATE
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
              OR app.es_servicio(copropiedad_id));

REVOKE ALL ON public.credenciales_de_equipo FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.credenciales_de_equipo TO authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.credenciales_de_equipo FROM authenticated, service_role;

DROP TRIGGER IF EXISTS tg_auditoria ON public.credenciales_de_equipo;
CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.credenciales_de_equipo
  FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria();

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.credenciales_de_equipo;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.credenciales_de_equipo
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- ═════════════════════════════════════════════════════════════════════════════
-- 4 · Aserciones de despliegue
--
-- Un control que nadie ha visto fallar no es un control: si alguien revierte
-- cualquiera de estas piezas, el siguiente despliegue lo dice aqui y no seis
-- semanas despues con un secreto en claro dentro de la base.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relname = 'credenciales_de_equipo'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  ASSERT n = 1, '0032: credenciales_de_equipo sin RLS forzada';

  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.viviendas'::regclass
     AND tgname = 'tg_viviendas_prohibir_delete' AND tgenabled <> 'D';
  ASSERT n = 1, '0032: viviendas sin disparador de borrado, o deshabilitado';

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'copropiedades_umbral_confianza_fijo';
  ASSERT n = 1, '0032: el umbral de confianza volvio a ser configurable';
END
$$;
