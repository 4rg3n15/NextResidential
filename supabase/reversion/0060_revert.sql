-- Reversión de la migración 0060 (D-145): el servicio vuelve a leer sólo los
-- usuarios de su copropiedad (0054). El historial vuelve a mostrar «Operador
-- sin nombre» para el operador de central asignado y el superadministrador.
\set ON_ERROR_STOP on

BEGIN;
DROP POLICY IF EXISTS usuarios_lectura_servicio_por_rol ON public.usuarios;
DROP POLICY IF EXISTS roles_usuario_lectura_servicio ON public.roles_usuario;
COMMIT;
