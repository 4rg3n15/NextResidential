import 'server-only';
import type { CopropiedadResumen } from '@ncr/contracts';
import { alcanceDeCopropiedades, sesionActual } from '@/lib/sesion/servidor';
import { copropiedadElegida } from '@/lib/sesion/cookies';

/**
 * La copropiedad activa de la sesión, resuelta en el SERVIDOR.
 *
 * **Aquí vivió el defecto que dejó inutilizado al superadministrador durante
 * una semana.** La versión anterior era:
 *
 *     return sesion.copropiedadId ?? sesion.copropiedadesAtendidas[0] ?? null;
 *
 * Para un superadministrador los dos son vacíos **por diseño**: no pertenece a
 * ninguna copropiedad, su `copropiedad_id` va nulo en el token a propósito y su
 * alcance lo resuelve `app.es_superadmin()`. Así que devolvía `null`, y las
 * siete pantallas pintaban «sin permiso» al único rol que puede administrarlo
 * todo. **La consola colapsaba «alcance global» en «sin alcance»**, que son lo
 * contrario.
 *
 * Ahora: si el token trae una copropiedad, esa; si no, se le pregunta a la API
 * cuáles alcanza —`GET /copropiedades`— y se toma la elegida o la primera.
 *
 * La elección vive en una cookie, y **la cookie no concede nada**: se contrasta
 * contra el catálogo que la API devolvió. Una manipulada no amplía el alcance;
 * se descarta y se cae en la primera legítima. El identificador nunca sale de
 * la URL ni de un campo del cliente.
 */
export interface AlcanceActivo {
  readonly copropiedadId: string | null;
  readonly disponibles: readonly CopropiedadResumen[];
  /** true cuando alcanza varias y tiene sentido ofrecer el conmutador. */
  readonly puedeConmutar: boolean;
  /** true cuando el alcance es global (superadministrador). */
  readonly alcanceGlobal: boolean;
}

export const alcanceActivo = async (): Promise<AlcanceActivo> => {
  const vacio: AlcanceActivo = {
    copropiedadId: null,
    disponibles: [],
    puedeConmutar: false,
    alcanceGlobal: false,
  };

  const sesion = await sesionActual();
  if (sesion === null) return vacio;

  const catalogo = await alcanceDeCopropiedades();
  const disponibles = catalogo?.copropiedades ?? [];
  const alcanceGlobal = catalogo?.alcanceGlobal ?? false;

  /**
   * El token manda cuando dice algo. Un administrador tiene UNA copropiedad y
   * no hay nada que elegir; consultar el catálogo para él sería darle a una
   * cookie la última palabra sobre su propio alcance.
   */
  if (sesion.copropiedadId !== null) {
    return {
      copropiedadId: sesion.copropiedadId,
      disponibles,
      puedeConmutar: false,
      alcanceGlobal,
    };
  }

  if (disponibles.length === 0) {
    // Sin copropiedad en el token y sin catálogo: sí es «sin alcance», y ahora
    // se dice por la razón correcta.
    return { ...vacio, alcanceGlobal };
  }

  const elegida = await copropiedadElegida();
  const valida = disponibles.some((c) => c.id === elegida);
  const activa = valida && elegida !== null ? elegida : (disponibles[0]?.id ?? null);

  return {
    copropiedadId: activa,
    disponibles,
    puedeConmutar: disponibles.length > 1,
    alcanceGlobal,
  };
};

/** Atajo para las pantallas, que solo necesitan el identificador. */
export const copropiedadDeLaSesion = async (): Promise<string | null> =>
  (await alcanceActivo()).copropiedadId;

/**
 * Explicación honesta de por qué no hay copropiedad activa.
 *
 * Las ocho pantallas decían lo mismo —«tu sesión no tiene ninguna copropiedad
 * asignada»— y a un superadministrador eso era **falso**: su sesión alcanza
 * todas; lo que pasaba es que la consola no sabía enumerarlas. Un mensaje que
 * describe mal la causa manda al usuario a arreglar lo que no está roto: el
 * cliente pasó una semana buscando un problema de asignación de roles.
 */
export const motivoSinCopropiedad = (alcance: AlcanceActivo): string => {
  if (alcance.alcanceGlobal) {
    return 'Tu alcance es global, pero no hay ninguna copropiedad activa registrada todavía. Crea la primera con el guion de aprovisionamiento (docs/guias/RECUPERACION_Y_USUARIOS.md §B.3).';
  }
  if (alcance.disponibles.length === 0) {
    return 'Tu sesión no tiene ninguna copropiedad asignada. Un administrador debe asignarte al menos una.';
  }
  return 'No hay ninguna copropiedad activa seleccionada. Elige una en la cabecera.';
};
