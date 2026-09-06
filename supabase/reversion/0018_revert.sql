-- Reversión de 0018 · restaura la política recursiva de `residentes`.
-- ADVERTENCIA: la versión restaurada provoca «stack depth limit exceeded» en
-- cualquier base donde el dueño no sea superusuario — es decir, en Supabase.
-- Solo para desmontar el esquema completo.
DROP POLICY IF EXISTS residentes_lectura_residente ON public.residentes;
CREATE POLICY residentes_lectura_residente ON public.residentes FOR SELECT
  USING (app.puede_leer_residente(copropiedad_id, vivienda_id));
