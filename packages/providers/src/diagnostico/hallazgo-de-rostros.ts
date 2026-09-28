import type { CapacidadDeBiblioteca } from '../nucleo/capacidades';
import type { HallazgoDelEquipo } from './ficha';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F4 (corrección de la 15-L) · «ROSTROS: ADMITE / NO ADMITE / NO SE PUDO LEER»
 *
 * En sitio, la ficha del videoportero (serie Ultra) dijo «no se pudo leer si
 * el equipo tiene biblioteca de rostros» y nada más: ni qué consulta falló ni
 * qué contestó el equipo. Sin el motivo, `desconocida` no dice qué mirar, y la
 * decisión de sincronizarle rostros quedaba a ciegas.
 *
 * Ahora es un solo hallazgo, con el mismo nombre y las mismas tres palabras en
 * la terminal y en el videoportero: `admite`, `no admite` o `no se pudo leer
 * (motivo)`, con el motivo que el descubrimiento dejó en la capacidad. Lo que
 * cambia por familia es sólo la consecuencia de un «no»: en la terminal es un
 * BLOQUEO (no reconocerá a nadie); en el videoportero, un aviso de NO APLICA.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const CAMPO_DE_ROSTROS = 'Rostros';

/** Las tres palabras de la ficha; el motivo, sólo cuando no se pudo leer. */
export const leidoDeRostros = (biblioteca: CapacidadDeBiblioteca): string => {
  if (biblioteca.estado === 'si') return 'admite';
  if (biblioteca.estado === 'no') return 'no admite';
  const motivo = biblioteca.motivo ?? null;
  return motivo === null ? 'no se pudo leer' : `no se pudo leer (${motivo})`;
};

export interface TextosDeRostros {
  readonly detalleDeAdmite: string;
  /** Lo que se añade a «admite»: la ocupación o la capacidad declarada. */
  readonly ocupacion?: string | null;
  /** Si «admite» merece aviso (biblioteca casi llena). */
  readonly avisoDeAdmite?: boolean;
  readonly no: { readonly estado: 'aviso' | 'bloqueo'; readonly detalle: string };
  readonly valorCorrecto: string;
}

export const hallazgoDeRostros = (
  biblioteca: CapacidadDeBiblioteca,
  textos: TextosDeRostros,
): HallazgoDelEquipo => {
  const leido = leidoDeRostros(biblioteca);
  const base = { campo: CAMPO_DE_ROSTROS, valorCorrecto: textos.valorCorrecto, correccion: null };
  if (biblioteca.estado === 'si') {
    const ocupacion = textos.ocupacion ?? null;
    return {
      ...base,
      estado: textos.avisoDeAdmite === true ? 'aviso' : 'conforme',
      valorLeido: ocupacion === null ? leido : `${leido} · ${ocupacion}`,
      detalle: textos.detalleDeAdmite,
    };
  }
  if (biblioteca.estado === 'no') {
    return { ...base, estado: textos.no.estado, valorLeido: leido, detalle: textos.no.detalle };
  }
  // `no_comprobado`, nunca `conforme`: un blanco que se pinta en verde es el
  // falso verde que la ficha existe para evitar. Pero con el motivo, leído.
  return {
    ...base,
    estado: 'no_comprobado',
    valorLeido: leido,
    detalle:
      (biblioteca.motivo ?? null) === null
        ? 'No se pudo leer si el equipo admite rostros: sondee de nuevo'
        : 'No se pudo leer si el equipo admite rostros. Lo que contestó está entre ' +
          'paréntesis: con eso se sabe si es la ruta, la credencial o el modelo',
  };
};
