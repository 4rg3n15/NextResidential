-- =============================================================================
-- 0014 · Row Level Security · matriz de modelo-datos.md §8
--
-- RLS habilitada Y FORZADA en las 29 tablas, sin excepción. FORCE importa: sin
-- él, el propietario de la tabla elude sus propias políticas.
--
-- ATENCIÓN — el agujero conocido: la clave `service_role` de Supabase OMITE
-- RLS por completo. Toda esta migración es papel mojado en cualquier ruta que
-- la use, y hay tres que la usan por diseño (ingesta de eventos, pg-boss y el
-- Edge). La contención está en tres capas y esta es solo la primera:
--   1. Estructural — las restricciones y CHECK no dependen de RLS, y el REVOKE
--      de la migración 0015 tampoco se elude con esa clave.
--   2. Aplicación — ETAPA 03: toda ruta con service_role valida copropiedad_id
--      explícitamente en el caso de uso.
--   3. Verificación — ETAPAS 03 y 13: la suite recorre los endpoints por los
--      dos caminos y rompe el build ante cualquier fuga.
-- =============================================================================

-- Predicados compuestos, para que cada política se lea de un vistazo ----------

-- Lectura operativa: administrador y portero en su copropiedad; operador de
-- central en las que atiende; servicio en la suya; superadministrador en todas.
CREATE OR REPLACE FUNCTION app.puede_leer_operacion(p_copropiedad_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.es_superadmin()
      OR (app.rol() IN ('administrador','portero','servicio')
          AND app.es_mi_copropiedad(p_copropiedad_id))
      OR (app.rol() = 'operador_central'
          AND app.es_copropiedad_atendida(p_copropiedad_id));
$$;

-- Escritura de configuración: solo el administrador de esa copropiedad.
CREATE OR REPLACE FUNCTION app.puede_administrar(p_copropiedad_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.rol() = 'administrador' AND app.es_mi_copropiedad(p_copropiedad_id);
$$;

-- Lectura del residente: lo operativo de SU vivienda.
CREATE OR REPLACE FUNCTION app.puede_leer_residente(p_copropiedad_id uuid, p_vivienda_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.rol() = 'residente'
     AND app.es_mi_copropiedad(p_copropiedad_id)
     AND app.es_mi_vivienda(p_vivienda_id);
$$;

-- Identidad de servicio (Edge, workers, ingesta).
CREATE OR REPLACE FUNCTION app.es_servicio(p_copropiedad_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.rol() = 'servicio' AND app.es_mi_copropiedad(p_copropiedad_id);
$$;

-- RN-07: solo administrador y operador de central gestionan listas negras.
CREATE OR REPLACE FUNCTION app.puede_gestionar_lista_negra(p_copropiedad_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (app.rol() = 'administrador'    AND app.es_mi_copropiedad(p_copropiedad_id))
      OR (app.rol() = 'operador_central' AND app.es_copropiedad_atendida(p_copropiedad_id));
$$;

-- Activación de RLS en todas las tablas ---------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Generador de las políticas de patrón «configuración de copropiedad» ---------
-- Lectura operativa para todos los roles con alcance; escritura solo para el
-- administrador. Se aplica a las tablas que comparten exactamente ese patrón.
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'personas','viviendas','niveles_acceso','residentes','visitantes',
    'zonas','zona_horarios','puntos_de_acceso','versiones_de_reglas','reglas'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_lectura   ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insercion ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_edicion   ON public.%I', t, t);

    EXECUTE format(
      'CREATE POLICY %I_lectura ON public.%I FOR SELECT
         USING (app.puede_leer_operacion(copropiedad_id))', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insercion ON public.%I FOR INSERT
         WITH CHECK (app.puede_administrar(copropiedad_id))', t, t);
    EXECUTE format(
      'CREATE POLICY %I_edicion ON public.%I FOR UPDATE
         USING (app.puede_administrar(copropiedad_id))
         WITH CHECK (app.puede_administrar(copropiedad_id))', t, t);
  END LOOP;
END
$$;

-- copropiedades ---------------------------------------------------------------
DROP POLICY IF EXISTS copropiedades_lectura   ON public.copropiedades;
DROP POLICY IF EXISTS copropiedades_insercion ON public.copropiedades;
DROP POLICY IF EXISTS copropiedades_edicion   ON public.copropiedades;

CREATE POLICY copropiedades_lectura ON public.copropiedades FOR SELECT
  USING (app.puede_leer_operacion(id) OR app.rol() = 'residente' AND app.es_mi_copropiedad(id));
-- Solo el superadministrador crea copropiedades (HU-36).
CREATE POLICY copropiedades_insercion ON public.copropiedades FOR INSERT
  WITH CHECK (app.es_superadmin());
CREATE POLICY copropiedades_edicion ON public.copropiedades FOR UPDATE
  USING (app.es_superadmin() OR app.puede_administrar(id))
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(id));

-- usuarios · decisión D-02 ----------------------------------------------------
-- Las filas con copropiedad_id NULL (superadministradores) solo las ve un
-- superadministrador. Es el punto donde el aislamiento puede fallar por diseño.
DROP POLICY IF EXISTS usuarios_lectura   ON public.usuarios;
DROP POLICY IF EXISTS usuarios_insercion ON public.usuarios;
DROP POLICY IF EXISTS usuarios_edicion   ON public.usuarios;

CREATE POLICY usuarios_lectura ON public.usuarios FOR SELECT
  USING (
    app.es_superadmin()
    OR (copropiedad_id IS NOT NULL AND app.puede_administrar(copropiedad_id))
    OR id = app.usuario_id()
  );
CREATE POLICY usuarios_insercion ON public.usuarios FOR INSERT
  WITH CHECK (app.es_superadmin()
              OR (copropiedad_id IS NOT NULL AND app.puede_administrar(copropiedad_id)));
CREATE POLICY usuarios_edicion ON public.usuarios FOR UPDATE
  USING (app.es_superadmin()
         OR (copropiedad_id IS NOT NULL AND app.puede_administrar(copropiedad_id))
         OR id = app.usuario_id())
  WITH CHECK (app.es_superadmin()
              OR (copropiedad_id IS NOT NULL AND app.puede_administrar(copropiedad_id))
              OR id = app.usuario_id());

-- roles_usuario ---------------------------------------------------------------
DROP POLICY IF EXISTS roles_usuario_lectura   ON public.roles_usuario;
DROP POLICY IF EXISTS roles_usuario_insercion ON public.roles_usuario;
DROP POLICY IF EXISTS roles_usuario_edicion   ON public.roles_usuario;

CREATE POLICY roles_usuario_lectura ON public.roles_usuario FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR usuario_id = app.usuario_id());
CREATE POLICY roles_usuario_insercion ON public.roles_usuario FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id));
CREATE POLICY roles_usuario_edicion ON public.roles_usuario FOR UPDATE
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id));

-- El residente ve además a los suyos: se añade una política permisiva extra
-- sobre personas y residentes (las políticas RLS son OR entre sí).
DROP POLICY IF EXISTS personas_lectura_residente ON public.personas;
CREATE POLICY personas_lectura_residente ON public.personas FOR SELECT
  USING (app.rol() = 'residente' AND app.es_mi_copropiedad(copropiedad_id)
         AND EXISTS (SELECT 1 FROM public.residentes r
                      WHERE r.persona_id = personas.id
                        AND app.es_mi_vivienda(r.vivienda_id)));
DROP POLICY IF EXISTS residentes_lectura_residente ON public.residentes;
CREATE POLICY residentes_lectura_residente ON public.residentes FOR SELECT
  USING (app.puede_leer_residente(copropiedad_id, vivienda_id));
DROP POLICY IF EXISTS viviendas_lectura_residente ON public.viviendas;
CREATE POLICY viviendas_lectura_residente ON public.viviendas FOR SELECT
  USING (app.rol() = 'residente' AND app.es_mi_copropiedad(copropiedad_id)
         AND app.es_mi_vivienda(id));
DROP POLICY IF EXISTS zonas_lectura_residente ON public.zonas;
CREATE POLICY zonas_lectura_residente ON public.zonas FOR SELECT
  USING (app.rol() = 'residente' AND app.es_mi_copropiedad(copropiedad_id));
DROP POLICY IF EXISTS zona_horarios_lectura_residente ON public.zona_horarios;
CREATE POLICY zona_horarios_lectura_residente ON public.zona_horarios FOR SELECT
  USING (app.rol() = 'residente' AND app.es_mi_copropiedad(copropiedad_id));

-- vehiculos · el residente gestiona los de SU vivienda (HU-05) ----------------
DROP POLICY IF EXISTS vehiculos_lectura   ON public.vehiculos;
DROP POLICY IF EXISTS vehiculos_insercion ON public.vehiculos;
DROP POLICY IF EXISTS vehiculos_edicion   ON public.vehiculos;

CREATE POLICY vehiculos_lectura ON public.vehiculos FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id)
         OR app.puede_leer_residente(copropiedad_id, vivienda_id));
CREATE POLICY vehiculos_insercion ON public.vehiculos FOR INSERT
  WITH CHECK (app.puede_administrar(copropiedad_id)
              OR app.puede_leer_residente(copropiedad_id, vivienda_id));
CREATE POLICY vehiculos_edicion ON public.vehiculos FOR UPDATE
  USING (app.puede_administrar(copropiedad_id)
         OR app.puede_leer_residente(copropiedad_id, vivienda_id))
  WITH CHECK (app.puede_administrar(copropiedad_id)
              OR app.puede_leer_residente(copropiedad_id, vivienda_id));

-- autorizaciones y sus hijas · el residente autoriza en SU vivienda (HU-07) ---
DROP POLICY IF EXISTS autorizaciones_lectura   ON public.autorizaciones;
DROP POLICY IF EXISTS autorizaciones_insercion ON public.autorizaciones;
DROP POLICY IF EXISTS autorizaciones_edicion   ON public.autorizaciones;

CREATE POLICY autorizaciones_lectura ON public.autorizaciones FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id)
         OR app.puede_leer_residente(copropiedad_id, vivienda_id));
CREATE POLICY autorizaciones_insercion ON public.autorizaciones FOR INSERT
  WITH CHECK (app.puede_administrar(copropiedad_id)
              OR app.puede_leer_residente(copropiedad_id, vivienda_id));
CREATE POLICY autorizaciones_edicion ON public.autorizaciones FOR UPDATE
  USING (app.puede_administrar(copropiedad_id)
         OR app.puede_leer_residente(copropiedad_id, vivienda_id))
  WITH CHECK (app.puede_administrar(copropiedad_id)
              OR app.puede_leer_residente(copropiedad_id, vivienda_id));

DO $$
DECLARE
  t text;
  hijas text[] := ARRAY['patrones_recurrencia','autorizacion_acompanantes','autorizaciones_zona'];
BEGIN
  FOREACH t IN ARRAY hijas LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_lectura   ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insercion ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_edicion   ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_lectura ON public.%I FOR SELECT USING (
         app.puede_leer_operacion(copropiedad_id)
         OR EXISTS (SELECT 1 FROM public.autorizaciones a
                     WHERE a.id = %I.autorizacion_id
                       AND app.puede_leer_residente(a.copropiedad_id, a.vivienda_id)))', t, t, t);
    EXECUTE format(
      'CREATE POLICY %I_insercion ON public.%I FOR INSERT WITH CHECK (
         app.puede_administrar(copropiedad_id)
         OR EXISTS (SELECT 1 FROM public.autorizaciones a
                     WHERE a.id = %I.autorizacion_id
                       AND app.puede_leer_residente(a.copropiedad_id, a.vivienda_id)))', t, t, t);
    EXECUTE format(
      'CREATE POLICY %I_edicion ON public.%I FOR UPDATE USING (
         app.puede_administrar(copropiedad_id)) WITH CHECK (app.puede_administrar(copropiedad_id))', t, t);
  END LOOP;
END
$$;

-- zona_aforo · solo el servicio mueve el contador (decisión D-04) -------------
DROP POLICY IF EXISTS zona_aforo_lectura ON public.zona_aforo;
DROP POLICY IF EXISTS zona_aforo_edicion ON public.zona_aforo;
DROP POLICY IF EXISTS zona_aforo_insercion ON public.zona_aforo;

CREATE POLICY zona_aforo_lectura ON public.zona_aforo FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id)
         OR (app.rol() = 'residente' AND app.es_mi_copropiedad(copropiedad_id)));
CREATE POLICY zona_aforo_insercion ON public.zona_aforo FOR INSERT
  WITH CHECK (app.puede_administrar(copropiedad_id));
CREATE POLICY zona_aforo_edicion ON public.zona_aforo FOR UPDATE
  USING (app.es_servicio(copropiedad_id) OR app.puede_administrar(copropiedad_id))
  WITH CHECK (app.es_servicio(copropiedad_id) OR app.puede_administrar(copropiedad_id));

-- zonas · el operador de central puede CERRAR una zona (PB-04) ----------------
DROP POLICY IF EXISTS zonas_cierre_operador ON public.zonas;
CREATE POLICY zonas_cierre_operador ON public.zonas FOR UPDATE
  USING (app.rol() = 'operador_central' AND app.es_copropiedad_atendida(copropiedad_id))
  WITH CHECK (app.rol() = 'operador_central' AND app.es_copropiedad_atendida(copropiedad_id));

-- listas_negras · RN-07 -------------------------------------------------------
DROP POLICY IF EXISTS listas_negras_lectura   ON public.listas_negras;
DROP POLICY IF EXISTS listas_negras_insercion ON public.listas_negras;
DROP POLICY IF EXISTS listas_negras_edicion   ON public.listas_negras;

CREATE POLICY listas_negras_lectura ON public.listas_negras FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id));
-- Solo administrador y operador de central crean o levantan (RN-07).
CREATE POLICY listas_negras_insercion ON public.listas_negras FOR INSERT
  WITH CHECK (app.puede_gestionar_lista_negra(copropiedad_id));
CREATE POLICY listas_negras_edicion ON public.listas_negras FOR UPDATE
  USING (app.puede_gestionar_lista_negra(copropiedad_id))
  WITH CHECK (app.puede_gestionar_lista_negra(copropiedad_id));

-- Biometría · el vector nunca se lee por RLS (nota 6 de la matriz) ------------
DROP POLICY IF EXISTS consent_lectura   ON public.consentimientos_biometricos;
DROP POLICY IF EXISTS consent_escritura ON public.consentimientos_biometricos;
DROP POLICY IF EXISTS consent_edicion   ON public.consentimientos_biometricos;

CREATE POLICY consent_lectura ON public.consentimientos_biometricos FOR SELECT
  USING (app.es_superadmin()
         OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id)
         OR (app.rol() = 'residente' AND app.es_mi_copropiedad(copropiedad_id)));
CREATE POLICY consent_escritura ON public.consentimientos_biometricos FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id) OR app.puede_administrar(copropiedad_id));
CREATE POLICY consent_edicion ON public.consentimientos_biometricos FOR UPDATE
  USING (app.es_servicio(copropiedad_id) OR app.puede_administrar(copropiedad_id))
  WITH CHECK (app.es_servicio(copropiedad_id) OR app.puede_administrar(copropiedad_id));

DO $$
DECLARE
  t text;
  tablas text[] := ARRAY['plantillas_biometricas','plantilla_sincronizaciones'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_lectura   ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_escritura ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_edicion   ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_lectura ON public.%I FOR SELECT USING (
         app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id))', t, t);
    EXECUTE format(
      'CREATE POLICY %I_escritura ON public.%I FOR INSERT WITH CHECK (
         app.es_servicio(copropiedad_id))', t, t);
    EXECUTE format(
      'CREATE POLICY %I_edicion ON public.%I FOR UPDATE
         USING (app.es_servicio(copropiedad_id))
         WITH CHECK (app.es_servicio(copropiedad_id))', t, t);
  END LOOP;
END
$$;

-- Dispositivos y Edge ---------------------------------------------------------
-- Portero y operador NO leen la tabla base: usan la vista dispositivos_operativos,
-- que no expone host ni credencial_ref (contradicción C-11).
DROP POLICY IF EXISTS dispositivos_lectura   ON public.dispositivos;
DROP POLICY IF EXISTS dispositivos_insercion ON public.dispositivos;
DROP POLICY IF EXISTS dispositivos_edicion   ON public.dispositivos;

CREATE POLICY dispositivos_lectura ON public.dispositivos FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY dispositivos_insercion ON public.dispositivos FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id));
CREATE POLICY dispositivos_edicion ON public.dispositivos FOR UPDATE
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
              OR app.es_servicio(copropiedad_id));

DROP POLICY IF EXISTS edge_lectura   ON public.edge_gateways;
DROP POLICY IF EXISTS edge_insercion ON public.edge_gateways;
DROP POLICY IF EXISTS edge_edicion   ON public.edge_gateways;

CREATE POLICY edge_lectura ON public.edge_gateways FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY edge_insercion ON public.edge_gateways FOR INSERT
  WITH CHECK (app.es_superadmin());
CREATE POLICY edge_edicion ON public.edge_gateways FOR UPDATE
  USING (app.es_superadmin() OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));

-- eventos · lectura por alcance, inserción por quien opera. Nunca UPDATE ni
-- DELETE: no se conceden a nadie (migración 0015, ADR-005).
DROP POLICY IF EXISTS eventos_lectura   ON public.eventos;
DROP POLICY IF EXISTS eventos_insercion ON public.eventos;

CREATE POLICY eventos_lectura ON public.eventos FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id)
         OR (vivienda_id IS NOT NULL
             AND app.puede_leer_residente(copropiedad_id, vivienda_id)));
CREATE POLICY eventos_insercion ON public.eventos FOR INSERT
  WITH CHECK (app.puede_leer_operacion(copropiedad_id));

DROP POLICY IF EXISTS evidencias_lectura   ON public.evidencias;
DROP POLICY IF EXISTS evidencias_insercion ON public.evidencias;
CREATE POLICY evidencias_lectura ON public.evidencias FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id)
         OR (app.rol() = 'residente' AND app.es_mi_copropiedad(copropiedad_id)));
CREATE POLICY evidencias_insercion ON public.evidencias FOR INSERT
  WITH CHECK (app.puede_leer_operacion(copropiedad_id));

-- alertas ---------------------------------------------------------------------
DROP POLICY IF EXISTS alertas_lectura   ON public.alertas;
DROP POLICY IF EXISTS alertas_insercion ON public.alertas;
DROP POLICY IF EXISTS alertas_edicion   ON public.alertas;
CREATE POLICY alertas_lectura ON public.alertas FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id));
CREATE POLICY alertas_insercion ON public.alertas FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));
CREATE POLICY alertas_edicion ON public.alertas FOR UPDATE
  USING (app.puede_leer_operacion(copropiedad_id))
  WITH CHECK (app.puede_leer_operacion(copropiedad_id));

-- auditoria_seguridad · decisión D-14 -----------------------------------------
-- El administrador ve los intentos CONTRA su copropiedad, no los que salieron
-- de ella hacia otras: esos son del superadministrador, porque revelan
-- actividad de un tenant a otro.
DROP POLICY IF EXISTS auditoria_lectura   ON public.auditoria_seguridad;
DROP POLICY IF EXISTS auditoria_insercion ON public.auditoria_seguridad;
CREATE POLICY auditoria_lectura ON public.auditoria_seguridad FOR SELECT
  USING (app.es_superadmin()
         OR (copropiedad_id_objetivo IS NOT NULL
             AND app.puede_administrar(copropiedad_id_objetivo)));
CREATE POLICY auditoria_insercion ON public.auditoria_seguridad FOR INSERT
  WITH CHECK (true);   -- todo intento debe poder registrarse, incluido el fallido

-- bandeja_salida_edge ---------------------------------------------------------
DROP POLICY IF EXISTS bandeja_lectura   ON public.bandeja_salida_edge;
DROP POLICY IF EXISTS bandeja_insercion ON public.bandeja_salida_edge;
DROP POLICY IF EXISTS bandeja_edicion   ON public.bandeja_salida_edge;
CREATE POLICY bandeja_lectura ON public.bandeja_salida_edge FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY bandeja_insercion ON public.bandeja_salida_edge FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));
CREATE POLICY bandeja_edicion ON public.bandeja_salida_edge FOR UPDATE
  USING (app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_servicio(copropiedad_id));
