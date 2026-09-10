-- =============================================================================
-- 0027 · tipo de vehiculo
--
-- HUECO REAL DEL PADRON, detectado al construir la pantalla de vehiculos de la
-- ETAPA 09-B: el mockup y el requisito piden mostrar el TIPO y la tabla no lo
-- tenia. `es_principal` responde a otra pregunta —cual es el vehiculo
-- principal de la vivienda—, no a que clase de vehiculo es.
--
-- Catalogo cerrado y no texto libre: el motor de reglas y los informes agrupan
-- por este campo, y un texto libre produce «Automovil», «automovil» y «auto»
-- como tres categorias distintas. Se anade como enumerado por el mismo motivo
-- que `estado_registro`.
--
-- `automovil` por defecto para las filas existentes: es el caso mayoritario y
-- no inventa informacion que nadie declaro; quien la conozca la corrige desde
-- la pantalla. Dejarlo NULL habria obligado a toda consulta a decidir que
-- hacer con el vacio.
--
-- Idempotente y reversible, como exige la ETAPA 01.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_vehiculo') THEN
    CREATE TYPE tipo_vehiculo AS ENUM ('automovil', 'motocicleta', 'bicicleta', 'otro');
  END IF;
END $$;

ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS tipo tipo_vehiculo NOT NULL DEFAULT 'automovil';

COMMENT ON COLUMN public.vehiculos.tipo IS
  'Clase de vehiculo (ETAPA 09-B). Catalogo cerrado: los informes agrupan por el.';
