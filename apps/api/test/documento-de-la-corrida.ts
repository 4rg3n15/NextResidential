/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-148 · EL DOCUMENTO DE UN VISITANTE DE PRUEBA, ÚNICO POR CORRIDA
 *
 * `visitas-pg` cayó en el paso 7 del verificador de D-147 con dos pruebas a la
 * vez: «se vuelve a autorizar por la placa» (`expected undefined to be false`)
 * y «administración filtra por vivienda y por texto» (`expected [] …`). Las
 * dos buscan la visita que acaban de crear POR EL NOMBRE del visitante.
 *
 * No era una carrera. El documento salía de `CORRIDA` cambiando cada letra
 * hexadecimal por un 7: `0A0A0A` y `0B0C0D` daban los dos `9070707…`. Dos
 * corridas distintas con el mismo documento comparten persona, porque
 * `PersonasDeVisitaPg.resolver` reutiliza la persona ACTIVA de ese documento (es el
 * producto: una persona es su documento) y conserva el nombre de la primera.
 * La segunda corrida crea sus visitas, pero a nombre de «Visitante 0A0A0A …»,
 * y su búsqueda por «Visitante 0B0C0D» no encuentra nada. La base de pruebas
 * sólo se recrea en el paso 12, así que cada corrida suma documentos que la
 * siguiente puede pisar: con el 7 recibiendo siete de cada dieciséis
 * caracteres, dos corridas chocaban 1 vez de cada ~7 500. En la CI, con la base
 * recién creada, casi nunca; en una base local con decenas de corridas, de
 * vez en cuando.
 *
 * Reproducido: `0A0A0A` y luego `0B0C0D` contra la misma base dan exactamente
 * esas dos pruebas en rojo, en las mismas líneas y con los mismos mensajes.
 *
 * Ahora el documento es la `CORRIDA` leída como número: dos corridas distintas
 * no pueden dar el mismo documento. Sólo una `CORRIDA` repetida lo daría (1
 * entre 16,7 millones por corrida anterior), y para eso está
 * `documentosYaRegistrados`: el fichero falla diciéndolo, no con una lista vacía.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import type { Pool } from 'pg';

/** La `CORRIDA` de los ficheros de visitas: tres bytes en hexadecimal. */
const FORMA_DE_LA_CORRIDA = /^[0-9A-F]{6}$/;
const MAXIMO_POR_CORRIDA = 100;

/**
 * El documento `n` (0 a 99) de la corrida: el prefijo de la familia, la
 * corrida en decimal con ocho cifras y `n` con dos. Once caracteres: dentro de
 * los 4 a 32 del DTO y de los 4 a 20 de `personas_documento_normalizado`.
 */
export const documentoDeLaCorrida = (prefijo: string, corrida: string, n: number): string => {
  if (!FORMA_DE_LA_CORRIDA.test(corrida)) {
    throw new Error(`la corrida debe ser de seis cifras hexadecimales en mayúscula: «${corrida}»`);
  }
  if (!Number.isInteger(n) || n < 0 || n >= MAXIMO_POR_CORRIDA) {
    throw new Error(
      `el documento de una corrida va de 0 a ${String(MAXIMO_POR_CORRIDA - 1)}: ${String(n)}`,
    );
  }
  const corridaEnDecimal = String(Number.parseInt(corrida, 16)).padStart(8, '0');
  return `${prefijo}${corridaEnDecimal}${String(n).padStart(2, '0')}`;
};

/**
 * Los documentos de ESTA corrida que ya tienen una persona activa en la
 * copropiedad. Vacío es lo esperado; cualquier otro resultado significa que
 * las visitas de la corrida se apuntarían a una persona ajena.
 */
export const documentosYaRegistrados = async (
  pool: Pool,
  copropiedadId: string,
  prefijo: string,
  corrida: string,
): Promise<readonly string[]> => {
  const documentos = Array.from({ length: MAXIMO_POR_CORRIDA }, (_, n) =>
    documentoDeLaCorrida(prefijo, corrida, n),
  );
  const { rows } = await pool.query<{ numero_documento: string }>(
    `SELECT numero_documento FROM public.personas
      WHERE copropiedad_id = $1 AND estado = 'activo' AND numero_documento = ANY($2::text[])
      ORDER BY numero_documento`,
    [copropiedadId, documentos],
  );
  return rows.map((r) => r.numero_documento);
};
