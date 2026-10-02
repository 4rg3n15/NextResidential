import type { Bitacora } from '@ncr/domain-core';
import { EquipoNoRegistrado, ProtocoloInvalido } from '@ncr/providers';
import type { PublicacionDeEquipo, ResultadoDePublicacion, SesionDeTunel } from '@ncr/providers';
import type { RegistroDeAuditoria } from '../../comun/auditoria/registro';
import type { RutasDeEquipos } from '../../proveedores';
import type { GatewayRegistrado } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · B1/B2 · LO QUE LOS EQUIPOS LE DICEN AL EDGE, LLEGA A LA NUBE
 *
 * Con puente, los equipos reportan SÓLO al Edge (alertStream de la terminal y
 * del videoportero; el Alarm Server local de la cámara). El Edge reenvía cada
 * hecho como pedido `publicacion` y la API lo publica en la MISMA fuente que el
 * receptor directo: un solo ingestor, un solo camino a `RegistrarAcceso`.
 *
 *  · RN-15 · el equipo tiene que ser de la copropiedad DEL Edge y estar en una
 *    copropiedad con puente. Si no, `EquipoNoRegistrado`, y constancia de
 *    acceso cruzado: un Edge acreditado publicando por otro conjunto no es ruido.
 *  · B2 · la ingesta corre «dentro del hecho» (`enHechoDelEdge`): las órdenes
 *    que produzca salen con él como padre, y si el Edge ya lo resolvió por su
 *    cuenta, las rechaza. La barrera recibe UNA orden.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface Publicador {
  publicar(publicacion: PublicacionDeEquipo): Promise<ResultadoDePublicacion>;
}

export type EnHecho = <T>(hecho: string, decidir: () => Promise<T>) => Promise<T>;

const HECHO = /^[A-Za-z0-9_-]{1,64}$/;

const leer = (carga: unknown): { hechoId: string; publicacion: PublicacionDeEquipo } => {
  const { hechoId, publicacion } = (carga ?? {}) as { hechoId?: unknown; publicacion?: unknown };
  const evento = (publicacion as { evento?: { dispositivoId?: unknown } } | undefined)?.evento;
  if (typeof hechoId !== 'string' || !HECHO.test(hechoId)) {
    throw new ProtocoloInvalido('publicación sin hecho');
  }
  if (typeof evento?.dispositivoId !== 'string') {
    throw new ProtocoloInvalido('publicación sin equipo');
  }
  return { hechoId, publicacion: publicacion as PublicacionDeEquipo };
};

export class PublicacionesDelEdge {
  constructor(
    private readonly fuente: Publicador,
    private readonly rutas: RutasDeEquipos,
    private readonly auditoria: RegistroDeAuditoria,
    private readonly enHecho: EnHecho,
    private readonly bitacora: Bitacora,
  ) {}

  /** Lo instala la puerta en cada túnel abierto. */
  instalar(sesion: SesionDeTunel, gateway: GatewayRegistrado): void {
    sesion.atender('publicacion', (carga) => this.publicar(carga, gateway));
  }

  async publicar(carga: unknown, gateway: GatewayRegistrado): Promise<ResultadoDePublicacion> {
    const { hechoId, publicacion } = leer(carga);
    const dispositivoId = publicacion.evento.dispositivoId;
    const copropiedad = await this.rutas.puenteDe(dispositivoId);
    if (copropiedad !== gateway.copropiedadId) {
      await this.auditoria.registrarAccesoCruzado({
        usuarioId: gateway.usuarioServicioId,
        rol: 'edge',
        copropiedadSolicitada: copropiedad ?? 'desconocida',
        recurso: `tunel:publicacion:${dispositivoId}`,
      });
      this.bitacora.registrar('aviso', 'el Edge publicó por un equipo que no es suyo', {
        edgeId: gateway.id,
        dispositivoId,
      });
      throw new EquipoNoRegistrado(dispositivoId);
    }
    return this.enHecho(hechoId, () => this.fuente.publicar(publicacion));
  }
}
