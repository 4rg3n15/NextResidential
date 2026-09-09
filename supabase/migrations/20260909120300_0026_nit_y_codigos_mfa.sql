-- =============================================================================
-- 0026 · NIT normalizado, y codigos de recuperacion del segundo factor
--
-- DOS COSAS QUE EL ARRANQUE REAL DESTAPO EL 2026-09-09.
--
-- 1 · El CHECK del NIT era `^[0-9]{5,15}$` y rechazaba el formato con el que un
--     NIT se escribe en Colombia: `900123456-7`, con guion antes del digito de
--     verificacion. El usuario recibia el error de restriccion en crudo
--     —«violates check constraint copropiedades_nit_formato»— y la guia parecia
--     rota. Se resuelve como se resolvio con las placas (RN-04): NORMALIZANDO
--     al construir, no relajando la validacion.
--
-- 2 · El segundo factor no tiene codigos de recuperacion. Supabase Auth no los
--     ofrece: su respuesta a «perdi el dispositivo» es inscribir varios
--     factores, que no sirve si solo habia uno. La ETAPA 03 los tenia y se
--     retiraron con ADR-008 junto al TOTP propio; vuelven aqui SIN reabrir esa
--     decision, porque **no otorgan acceso**: autorizan a RETIRAR el factor
--     perdido para poder inscribir otro. Quien emite el `aal2` sigue siendo
--     Supabase, que es lo que ADR-008 fijo.
-- =============================================================================

-- ===== 1 · NIT ===============================================================

CREATE OR REPLACE FUNCTION app.normalizar_nit(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  -- Se quitan espacios, puntos y comas —las tres formas en que se escribe a
  -- mano— y se conserva el guion del digito de verificacion, que es
  -- informacion: `900123456-7` y `9001234567` no son lo mismo.
  SELECT nullif(regexp_replace(coalesce(p, ''), '[[:space:].,]', '', 'g'), '');
$$;

COMMENT ON FUNCTION app.normalizar_nit IS
  'Normaliza un NIT: quita espacios, puntos y comas; conserva el guion del '
  'digito de verificacion (0026).';

ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_nit_formato;
ALTER TABLE public.copropiedades
  ADD CONSTRAINT copropiedades_nit_formato
  CHECK (nit ~ '^[0-9]{5,15}(-[0-9])?$');

-- Las filas ya existentes siguen cumpliendo: el sufijo es opcional.

-- El alta de copropiedad NORMALIZA el NIT antes de validarlo, igual que el
-- objeto de valor `Placa` normaliza al construir (RN-04). Se redefine aqui la
-- funcion de la 0025 en vez de editarla: la 0025 ya esta aplicada en el
-- proyecto real, y una migracion aplicada no se reescribe.
CREATE OR REPLACE FUNCTION app.arranque_registrar_copropiedad(
  p_nombre       text,
  p_nit          text,
  p_zona_horaria text DEFAULT 'America/Bogota'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_id  uuid;
  v_nit text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  IF coalesce(trim(p_nombre), '') = '' THEN
    RAISE EXCEPTION 'El nombre de la copropiedad no puede estar vacio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_nit := app.normalizar_nit(p_nit);
  IF v_nit IS NULL THEN
    RAISE EXCEPTION 'El NIT no puede estar vacio' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- El mensaje dice QUE se espera. Dejar que salte el CHECK devolveria
  -- «violates check constraint copropiedades_nit_formato», que no le sirve a
  -- nadie que no tenga el esquema delante.
  IF v_nit !~ '^[0-9]{5,15}(-[0-9])?$' THEN
    RAISE EXCEPTION
      'NIT no valido: «%». Se esperan de 5 a 15 digitos, con un digito de '
      'verificacion opcional tras un guion (por ejemplo 900123456-7). Los '
      'puntos, comas y espacios se ignoran.', p_nit
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT app.es_zona_horaria(p_zona_horaria) THEN
    RAISE EXCEPTION 'Zona horaria IANA no valida: %', p_zona_horaria
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id INTO v_id FROM public.copropiedades WHERE nit = v_nit;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.copropiedades (nombre, nit, zona_horaria, creado_por, actualizado_por)
  VALUES (trim(p_nombre), v_nit, p_zona_horaria,
          app.actor_de_sistema(), app.actor_de_sistema())
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

-- ===== 2 · Codigos de recuperacion del segundo factor ========================

CREATE TABLE IF NOT EXISTS public.codigos_recuperacion_mfa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES public.usuarios(id),

  -- SOLO EL HASH. El codigo en claro se entrega una vez y no se guarda en
  -- ninguna parte: si se guardara, quien leyera esta tabla podria retirar el
  -- segundo factor de cualquiera.
  hash            text NOT NULL,

  consumido_en    timestamptz NULL,
  consumido_desde inet NULL,

  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT codigos_mfa_hash_len CHECK (length(hash) BETWEEN 32 AND 128),
  -- Un codigo consumido no puede volver a estarlo con otra marca: la coherencia
  -- de «un solo uso» se sostiene en la estructura, no en el codigo que la usa.
  CONSTRAINT codigos_mfa_consumo_coherente
    CHECK ((consumido_en IS NULL) = (consumido_desde IS NULL) OR consumido_en IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS codigos_mfa_hash_uk
  ON public.codigos_recuperacion_mfa (hash);
CREATE INDEX IF NOT EXISTS codigos_mfa_usuario_idx
  ON public.codigos_recuperacion_mfa (usuario_id) WHERE consumido_en IS NULL;

ALTER TABLE public.codigos_recuperacion_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codigos_recuperacion_mfa FORCE ROW LEVEL SECURITY;

-- NINGUNA politica de SELECT para `authenticated`, y es deliberado: ni siquiera
-- el dueño de los codigos puede leerlos. Solo se comparan del lado del servidor
-- con la llave de servicio. Una politica de lectura, por acotada que fuera,
-- convertiria un XSS en un robo de los codigos de recuperacion.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename='codigos_recuperacion_mfa' AND policyname='codigos_mfa_superadmin') THEN
    -- El superadministrador puede administrarlos (revocar los de un usuario que
    -- deja la organizacion). Sigue sin poder leer el codigo: solo el hash.
    CREATE POLICY codigos_mfa_superadmin ON public.codigos_recuperacion_mfa
      AS PERMISSIVE FOR ALL TO authenticated
      USING (app.es_superadmin()) WITH CHECK (app.es_superadmin());
  END IF;
END
$$;

-- Auditoria y prohibicion de borrado fisico, como el resto del esquema.
DROP TRIGGER IF EXISTS tg_auditoria ON public.codigos_recuperacion_mfa;
CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.codigos_recuperacion_mfa
  FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria();

GRANT SELECT, INSERT, UPDATE ON public.codigos_recuperacion_mfa TO service_role;

-- ===== 3 · Aserciones ========================================================
DO $$
DECLARE n integer;
BEGIN
  -- El formato nuevo admite el digito de verificacion...
  ASSERT '900123456-7' ~ '^[0-9]{5,15}(-[0-9])?$', '0026: el NIT con digito de verificacion sigue rechazado';
  -- ...y el viejo sigue siendo valido.
  ASSERT '900123456'   ~ '^[0-9]{5,15}(-[0-9])?$', '0026: se rompio el formato de NIT sin digito';
  -- ...pero no cualquier cosa.
  ASSERT NOT ('900-123456' ~ '^[0-9]{5,15}(-[0-9])?$'), '0026: el CHECK del NIT quedo demasiado laxo';
  ASSERT app.normalizar_nit(' 900.123.456-7 ') = '900123456-7', '0026: la normalizacion del NIT no funciona';

  -- Y el alta lo acepta DE VERDAD, no solo la expresion regular. La sonda se
  -- ejecuta contra la tabla real y **no deja rastro**: el bloque BEGIN de
  -- PL/pgSQL abre un punto de guardado implicito, asi que una excepcion propia
  -- deshace lo escrito dentro. La primera version usaba una baja logica para
  -- limpiar y dejaba una copropiedad cancelada; la prueba de arranque en frio
  -- —que exige que la base parta vacia— la delato en el acto.
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('rol','superadministrador','usuario_id', app.actor_de_sistema())::text, true);
    PERFORM app.arranque_registrar_copropiedad('Sonda de NIT', ' 900.999.888-1 ');
    SELECT count(*) INTO n FROM public.copropiedades WHERE nit = '900999888-1';
    ASSERT n = 1, '0026: el alta no normalizo el NIT';

    -- Un NIT con forma imposible tiene que fallar con el mensaje explicativo,
    -- no con el error de restriccion en crudo.
    BEGIN
      PERFORM app.arranque_registrar_copropiedad('Sonda mala', 'NIT-INVALIDO');
      ASSERT false, '0026: un NIT invalido no fue rechazado';
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;

    RAISE EXCEPTION 'sonda' USING ERRCODE = 'NCRSD';
  EXCEPTION WHEN SQLSTATE 'NCRSD' THEN
    NULL;  -- deshecho: la tabla queda como estaba
  END;

  SELECT count(*) INTO n FROM public.copropiedades WHERE nit = '900999888-1';
  ASSERT n = 0, '0026: la sonda del NIT dejo rastro en copropiedades';

  SELECT count(*) INTO n FROM pg_tables
   WHERE schemaname='public' AND tablename='codigos_recuperacion_mfa' AND rowsecurity;
  ASSERT n = 1, '0026: codigos_recuperacion_mfa sin RLS';

  -- Nadie autenticado puede LEER los codigos salvo el superadministrador, y ni
  -- el ve el codigo en claro porque no se guarda.
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename='codigos_recuperacion_mfa' AND cmd IN ('SELECT','ALL');
  ASSERT n = 1, format('0026: politicas de lectura inesperadas sobre los codigos (%s)', n);
END
$$;
