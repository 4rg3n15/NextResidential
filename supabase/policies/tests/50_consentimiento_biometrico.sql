-- =============================================================================
-- El consentimiento manda: RN-09, RN-10, RN-11 · CA-09, CA-10, CA-11
--
-- Se ejecuta con `service_role`, que OMITE RLS. Es deliberado y es el punto:
-- estas garantías no pueden depender de las políticas de fila, porque la llave
-- secreta —la que usan el Edge, los workers y la ingesta— las omite. Si el
-- cerrojo del consentimiento viviera solo en la RLS, el camino de servicio
-- podría sincronizar una plantilla sin consentimiento y nadie lo notaría.
-- =============================================================================

\set ON_ERROR_STOP on
SET ROLE service_role;
SET request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000002"}';

\set COP    '''10000000-0000-4000-8000-000000000001'''
\set ACTOR  '''00000000-0000-4000-8000-000000000002'''
-- Titular: el VISITANTE (RN-10), no el residente que lo invita.
\set TITULAR '''40000000-0000-4000-8000-000000000103'''
\set AUTORIZ '''70000000-0000-4000-8000-000000000001'''

-- No hay bloque de limpieza previa, y no es un olvido: `verificar.sh` recrea la
-- base en cada ejecución. Además, ninguna de estas tres tablas concede DELETE
-- —el intento de escribirlo aquí murió con «permission denied», que es la
-- prueba de que la política de no borrado de la ETAPA 01 alcanza también a la
-- biometría—.

-- RN-10 · el consentimiento nace PENDIENTE y a nombre del titular -------------
INSERT INTO public.consentimientos_biometricos
  (id, copropiedad_id, persona_id, version_politica, canal, creado_por, actualizado_por)
VALUES ('a0000000-0000-4000-8000-000000000001', :COP, :TITULAR, 'v1.0', 'app', :ACTOR, :ACTOR);

DO $$
DECLARE n int;
BEGIN
  -- D-08: no existe columna donde escribir «el residente consintio por el».
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name='consentimientos_biometricos'
     AND column_name IN ('residente_id','autorizado_por','solicitado_por_residente');
  ASSERT n = 0, 'RN-10: hay una columna que permitiria consentir en nombre de otro';
  RAISE NOTICE 'RN-10 el consentimiento no se puede delegar: no hay donde escribirlo: ok';
END
$$;

-- RN-09 nivel 1 · no hay plantilla sin fila de consentimiento -----------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.plantillas_biometricas
      (copropiedad_id, persona_id, consentimiento_id, calidad, suprimir_en,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000103',
            'a0000000-0000-4000-8000-0000000000ff', 0.900, now() + interval '8 hours',
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-09 INCUMPLIDA: plantilla con un consentimiento inexistente';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'RN-09 nivel 1 sin fila de consentimiento no hay plantilla: ok';
  END;
END
$$;

-- La plantilla sí se crea con el consentimiento PENDIENTE, en su estado propio.
INSERT INTO public.plantillas_biometricas
  (id, copropiedad_id, persona_id, consentimiento_id, autorizacion_id, calidad,
   vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, creado_por, actualizado_por)
VALUES ('b0000000-0000-4000-8000-000000000001', :COP, :TITULAR,
        'a0000000-0000-4000-8000-000000000001', :AUTORIZ, 0.910,
        '\x0102030405'::bytea, 'vault:ncr/plantillas/v1', 'AES-256-GCM',
        now() + interval '8 hours', 'pendiente_consentimiento', :ACTOR, :ACTOR);

-- RN-09 nivel 2 · sin consentimiento vigente no se pasa a estado sincronizable
DO $$
BEGIN
  BEGIN
    UPDATE public.plantillas_biometricas SET estado = 'pendiente_sincronizacion'
     WHERE id = 'b0000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'RN-09 INCUMPLIDA: se paso a sincronizable sin consentimiento vigente';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-09 nivel 2 sin consentimiento vigente no hay sincronizacion: ok';
  END;
END
$$;

-- RN-09 nivel 3 (ETAPA 08) · tampoco se registra la sincronizacion en terminal
-- Este es el hueco que la 0022 cierra: la fila que dice «la plantilla esta en
-- ESTE equipo» se escribia sin que nadie preguntara por el consentimiento.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.plantilla_sincronizaciones
      (copropiedad_id, plantilla_id, dispositivo_id, creado_por, actualizado_por)
    SELECT '10000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
           d.id,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002'
      FROM public.dispositivos d LIMIT 1;
    RAISE EXCEPTION 'RN-09 INCUMPLIDA: se registro sincronizacion en terminal sin consentimiento';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-09 nivel 3 sin consentimiento no hay fila de sincronizacion: ok';
  END;
END
$$;

-- Otorgado: a partir de aqui el camino se abre --------------------------------
UPDATE public.consentimientos_biometricos
   SET estado='vigente', otorgado_en=now(), actualizado_en=now(), actualizado_por=:ACTOR
 WHERE id='a0000000-0000-4000-8000-000000000001';

UPDATE public.plantillas_biometricas SET estado='pendiente_sincronizacion', actualizado_por=:ACTOR
 WHERE id='b0000000-0000-4000-8000-000000000001';

INSERT INTO public.plantilla_sincronizaciones
  (copropiedad_id, plantilla_id, dispositivo_id, estado, sincronizada_en, creado_por, actualizado_por)
SELECT :COP,'b0000000-0000-4000-8000-000000000001', d.id, 'sincronizada', now(), :ACTOR, :ACTOR
  FROM public.dispositivos d LIMIT 1;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.plantilla_sincronizaciones
   WHERE plantilla_id='b0000000-0000-4000-8000-000000000001' AND estado='sincronizada';
  ASSERT n = 1, 'con consentimiento vigente la sincronizacion debe poder registrarse';
  RAISE NOTICE 'CA-09 con consentimiento vigente si se sincroniza: ok';
END
$$;

-- CA-11 · revocar suprime de INMEDIATO, en la misma transaccion ---------------
UPDATE public.consentimientos_biometricos
   SET estado='revocado', revocado_en=now(), actualizado_en=now(), actualizado_por=:ACTOR
 WHERE id='a0000000-0000-4000-8000-000000000001';

DO $$
DECLARE r record;
BEGIN
  SELECT estado, vector_cifrado, llave_ref, suprimida_en INTO r
    FROM public.plantillas_biometricas WHERE id='b0000000-0000-4000-8000-000000000001';
  ASSERT r.estado = 'suprimida', format('CA-11: la plantilla quedo en %s', r.estado);
  -- Suprimir es borrar el vector, no etiquetar la fila.
  ASSERT r.vector_cifrado IS NULL, 'CA-11: el vector sigue en la base tras revocar';
  ASSERT r.llave_ref IS NULL, 'CA-11: la referencia de llave sigue tras revocar';
  ASSERT r.suprimida_en IS NOT NULL, 'CA-11: no consta cuando se suprimio';
  RAISE NOTICE 'CA-11 revocar borra el vector en la misma transaccion: ok';
END
$$;

-- CA-10 · la cola de retirada es una CONSULTA, no un estado que alguien escribe
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.plantilla_sincronizaciones s
    JOIN public.plantillas_biometricas p ON p.id = s.plantilla_id
   WHERE p.id = 'b0000000-0000-4000-8000-000000000001'
     AND p.estado = 'suprimida' AND s.estado = 'sincronizada';
  ASSERT n = 1, 'CA-10: la plantilla suprimida sigue constando en una terminal, y debe salir';
  RAISE NOTICE 'CA-10 la retirada de cada terminal queda en la cola derivada: ok';
END
$$;

-- Y tras revocar, retirar SIGUE permitido: el cerrojo frena propagar, no borrar
DO $$
BEGIN
  UPDATE public.plantilla_sincronizaciones SET estado='suprimida', suprimida_en=now(),
         actualizado_por='00000000-0000-4000-8000-000000000002'
   WHERE plantilla_id='b0000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'la supresion en terminal se permite aun sin consentimiento vigente: ok';
END
$$;

-- RN-11 · la cota legal es un CHECK, no un valor por defecto ------------------
--
-- La plantilla de un RESIDENTE, deliberadamente: es el unico camino donde el
-- disparador `tg_plantilla_retencion` (0016) devuelve antes de comprobar nada,
-- porque no hay autorizacion cuya vigencia atar. Probarlo sobre la plantilla de
-- un visitante daria verde con la cota RETIRADA —lo salvaria el disparador de
-- la 0016— y estariamos probando otro control creyendo probar este. Lo dijo la
-- mutacion: al soltar el CHECK, la prueba seguia en verde.
INSERT INTO public.consentimientos_biometricos
  (id, copropiedad_id, persona_id, version_politica, canal, estado, otorgado_en,
   creado_por, actualizado_por)
VALUES ('a0000000-0000-4000-8000-000000000002', :COP,
        '40000000-0000-4000-8000-000000000001', 'v1.0', 'presencial', 'vigente', now(),
        :ACTOR, :ACTOR);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.plantillas_biometricas
      (copropiedad_id, persona_id, consentimiento_id, calidad, suprimir_en,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000002', 0.950,
            now() + interval '6 years',
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-11 INCUMPLIDA: se acepto un plazo de conservacion sin cota';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-11 la cota de conservacion es estructural, tambien sin autorizacion: ok';
  END;
END
$$;

-- Y dentro de la cota, la misma plantilla de residente si se acepta: un control
-- que rechazara tambien el caso legitimo obligaria a desactivarlo.
INSERT INTO public.plantillas_biometricas
  (copropiedad_id, persona_id, consentimiento_id, calidad, suprimir_en, creado_por, actualizado_por)
VALUES (:COP,'40000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002',
        0.950, now() + interval '2 years', :ACTOR, :ACTOR);

DO $$
BEGIN
  BEGIN
    UPDATE public.copropiedades SET margen_supresion_plantilla = interval '48 hours'
     WHERE id='10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'RN-11 INCUMPLIDA: se configuro un margen mayor que el legal';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-11 el margen configurable no puede exceder 24 h: ok';
  END;
END
$$;

RESET ROLE;
