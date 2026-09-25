import type { Pool } from 'pg';
import type { Acceso, FiltroDeEventos } from '@ncr/domain-core';
import type {
  EventoRegistrado,
  PaginaDeEventos,
  RepositorioEventos,
  ResultadoAnexado,
} from '../aplicacion/puertos';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { RepositorioEventosPg } from './repositorio-eventos-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL HISTÓRICO EN POSTGRESQL, EN TIEMPO DE EJECUCIÓN · ETAPA 15-E
 *
 * `RepositorioEventosPg` existía desde la ETAPA 06, probado contra base real, y
 * **nadie lo cableaba**: el módulo de eventos seguía con el doble en memoria
 * «por D-17, sin contraseña de PostgreSQL», mientras el padrón, las
 * autorizaciones, la lista negra y los equipos ya leían y escribían la base
 * con el mismo `Pool`. Consecuencia: la prueba en sitio habría dejado el
 * histórico en un proceso que muere al reiniciar, y la hoja de resultados no
 * tendría contra qué reconciliarse.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ES UN ENVOLTORIO Y NO UNA INSTANCIA CON CLAIMS FIJOS
 *
 * `RepositorioEventosPg` fija `request.jwt.claims` por instancia, que es lo
 * correcto cuando quien llama tiene un token. El módulo tiene UNA instancia
 * para todas las copropiedades y ningún token: lo que tiene es la identidad de
 * SERVICIO, y `app.es_servicio(copropiedad_id)` exige nombrar la copropiedad.
 * Cada operación del puerto ya la trae —en el acceso, en el filtro, en el
 * parámetro—, así que los claims se construyen POR LLAMADA con esa
 * copropiedad, nunca «para todas». La RLS sigue siendo la segunda barrera; la
 * primera es que el caso de uso que llega aquí ya comprobó el alcance del
 * tenant (§2.7.6, doble camino).
 */
export class RepositorioEventosPgDeServicio implements RepositorioEventos {
  constructor(private readonly pool: Pool) {}

  private de(copropiedadId: string): RepositorioEventosPg {
    return new RepositorioEventosPg(this.pool, claimsDeServicio(copropiedadId));
  }

  async anexar(acceso: Acceso, actorId: string): Promise<ResultadoAnexado> {
    return this.de(acceso.copropiedadId).anexar(acceso, actorId);
  }

  async consultar(filtro: FiltroDeEventos): Promise<PaginaDeEventos> {
    return this.de(filtro.copropiedadId).consultar(filtro);
  }

  async porId(copropiedadId: string, eventoId: string): Promise<EventoRegistrado | null> {
    return this.de(copropiedadId).porId(copropiedadId, eventoId);
  }
}
