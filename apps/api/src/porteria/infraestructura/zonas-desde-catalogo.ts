import type { RepositorioCopropiedades } from '../../multiempresa/repositorio-copropiedades';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { ZonasHorarias } from '../aplicacion/puertos';

/**
 * La zona horaria sale del catálogo de copropiedades que ya existe —el mismo
 * que la consola lista—, leído con la identidad de plataforma. Un solo sitio
 * para la zona evita que el turno y la configuración de la copropiedad la
 * lean de dos fuentes que podrían divergir.
 */
export class ZonasDesdeCatalogo implements ZonasHorarias {
  constructor(private readonly catalogo: RepositorioCopropiedades) {}

  async de(copropiedadId: string): Promise<string | null> {
    const todas = await this.catalogo.listarParaElAlcance({
      usuarioId: ACTOR_INGESTA,
      rol: 'superadministrador',
      copropiedadId: null,
      copropiedadesAtendidas: [],
      mfaVerificado: true,
    });
    return todas.find((c) => c.id === copropiedadId)?.zonaHoraria ?? null;
  }
}
