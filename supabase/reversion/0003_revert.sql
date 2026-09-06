-- Reversión de 0003 · funciones de contexto
DROP FUNCTION IF EXISTS app.normalizar_documento(text);
DROP FUNCTION IF EXISTS app.normalizar_placa(text);
DROP FUNCTION IF EXISTS app.tg_prohibir_delete();
DROP FUNCTION IF EXISTS app.tg_auditoria();
DROP FUNCTION IF EXISTS app.es_zona_horaria(text);
DROP FUNCTION IF EXISTS app.es_copropiedad_atendida(uuid);
DROP FUNCTION IF EXISTS app.es_mi_copropiedad(uuid);
DROP FUNCTION IF EXISTS app.es_superadmin();
DROP FUNCTION IF EXISTS app.copropiedades();
DROP FUNCTION IF EXISTS app.copropiedad_id();
DROP FUNCTION IF EXISTS app.persona_id();
DROP FUNCTION IF EXISTS app.usuario_id();
DROP FUNCTION IF EXISTS app.rol();
DROP FUNCTION IF EXISTS app.claims();
