-- =============================================================================
-- 0002 · Tipos enumerados
-- Catálogo completo de modelo-datos.md §5.
--
-- Se usan enumerados y no text+CHECK: un valor inesperado falla al escribir, la
-- lista es consultable desde el catálogo del sistema y el generador de OpenAPI
-- (ETAPA 02) puede derivar los tipos del cliente sin duplicar la lista a mano.
-- =============================================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('estado_registro',        ARRAY['activo','inactivo']),
      ('estado_tenant',          ARRAY['activa','suspendida','cancelada']),
      ('rol_usuario',            ARRAY['superadministrador','administrador','portero','operador_central','residente','servicio']),
      ('tipo_documento',         ARRAY['cedula','cedula_extranjeria','pasaporte','nit','otro']),
      ('estado_administrativo',  ARRAY['al_dia','en_mora','suspendida']),
      ('categoria_visitante',    ARRAY['visitante','contratista','proveedor','servicio_domestico']),
      ('tipo_autorizacion',      ARRAY['unica','recurrente']),
      ('estado_autorizacion',    ARRAY['activa','revocada']),
      ('tipo_zona',              ARRAY['vehicular','peatonal','comun']),
      ('politica_reinicio',      ARRAY['cierre_horario','manual','nunca']),
      ('tipo_dispositivo',       ARRAY['camara_lpr','terminal_facial','rele','intercom','controlador_io']),
      ('estado_dispositivo',     ARRAY['saludable','degradado','caido']),
      ('tipo_punto',             ARRAY['talanquera','torniquete','puerta','paso_peatonal']),
      ('sentido_paso',           ARRAY['ingreso','salida','bidireccional']),
      ('tipo_evento',            ARRAY['ingreso','salida','denegado','alerta','manual']),
      ('resultado_acceso',       ARRAY['permitido','negado']),
      -- Diez motivos: los nueve de CLAUDE.md §2.4 mas FUERA_DE_HORARIO.
      -- La decimo se anade por D-18, aprobada por el usuario: sin ella, CA-14
      -- (aforo superado) y CA-15 (fuera de horario) son indistinguibles en el
      -- evento. CLAUDE.md §2.4 queda actualizado en consecuencia.
      ('motivo_acceso',          ARRAY['VIGENCIA_EXPIRADA','AFORO_SUPERADO','LISTA_NEGRA',
                                       'ZONA_NO_AUTORIZADA','FUERA_DE_PATRON','FUERA_DE_HORARIO',
                                       'SIN_CONSENTIMIENTO','PLACA_DESCONOCIDA',
                                       'CONFIANZA_INSUFICIENTE','FALLO_TECNICO']),
      ('metodo_identificacion',  ARRAY['placa','rostro','credencial','manual','remoto']),
      ('canal_consentimiento',   ARRAY['app','sms','correo','whatsapp','presencial']),
      ('estado_consentimiento',  ARRAY['pendiente','vigente','rechazado','revocado','expirado']),
      ('estado_plantilla',       ARRAY['pendiente_consentimiento','pendiente_sincronizacion','activa','pendiente_supresion','suprimida']),
      ('estado_sincronizacion',  ARRAY['pendiente','sincronizada','fallida','suprimida']),
      ('estado_lista_negra',     ARRAY['activa','levantada']),
      ('tipo_alerta',            ARRAY['lista_negra','sabotaje','dispositivo_caido','acceso_dudoso','panico','apertura_fallida']),
      ('severidad_alerta',       ARRAY['informativa','media','alta','critica']),
      ('estado_alerta',          ARRAY['abierta','en_atencion','resuelta']),
      ('politica_contingencia',  ARRAY['denegar','escalar_portero']),
      ('estado_recepcion',       ARRAY['recibido','aplicado','descartado_duplicado']),
      ('tipo_evento_seguridad',  ARRAY['acceso_cruzado','login_fallido','mfa_fallido','escalamiento_privilegio','rate_limit','firma_invalida']),
      ('tipo_evidencia',         ARRAY['foto_completa','recorte_placa','captura_rostro','consentimiento'])
    ) AS v(nombre, valores)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = t.nombre) THEN
      EXECUTE format('CREATE TYPE public.%I AS ENUM (%s)',
                     t.nombre,
                     (SELECT string_agg(quote_literal(x), ',') FROM unnest(t.valores) AS x));
    END IF;
  END LOOP;
END
$$;

COMMENT ON TYPE public.motivo_acceso IS
  'Motivos tipados del VO ResultadoAcceso. FUERA_DE_HORARIO se anade por la '
  'decision D-18 de la ETAPA 01-A: CA-15 exige un motivo propio, distinto de '
  'AFORO_SUPERADO (CA-14) y de FUERA_DE_PATRON (RN-22).';
