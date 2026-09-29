import { networkInterfaces } from 'node:os';
import { ipHaciaElEquipo } from '@ncr/providers';
import type { InterfazDeRed } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { leerEquiposDeclarados } from '../../comun/equipos-de-alarm-server';
import type {
  ResolutorDeIpDelMac,
  SecretosDelAlarmServer,
} from '../aplicacion/configuracion-en-sitio';
import type { DatosDeEquipo } from '../aplicacion/puertos';
import type { SecretosDeAlarmServer } from '../aplicacion/secretos-de-alarm-server';

/**
 * C2 (corrección de la 15-L) · la IP de este Mac vista desde cada equipo: la
 * de la interfaz cuya subred lo contiene, o `ALARM_SERVER_IP_ANUNCIADA`. La
 * regla es pura y vive en el paquete de proveedores (el ensayo usa la misma);
 * aquí sólo se leen las interfaces del sistema, en cada llamada, porque el Mac
 * cambia de red sin reiniciar la API.
 */
export class IpDelMacPorInterfaces implements ResolutorDeIpDelMac {
  constructor(
    private readonly anunciada: string | undefined,
    private readonly interfaces: () => Readonly<
      Record<string, readonly InterfazDeRed[] | undefined>
    > = networkInterfaces,
  ) {}

  hacia(
    hostDelEquipo: string,
  ): { readonly ip: string } | { readonly ip: null; readonly motivo: string } {
    const r = ipHaciaElEquipo(hostDelEquipo, this.interfaces(), this.anunciada);
    return r.ip === null ? { ip: null, motivo: r.motivo } : { ip: r.ip };
  }
}

/** El secreto de cada cámara declarada en `ALARM_SERVER_EQUIPOS`, por su id. */
export class SecretosDeLaDeclaracion {
  private readonly porEquipo: ReadonlyMap<string, string>;

  constructor(declaracion: string | undefined) {
    this.porEquipo = new Map(
      leerEquiposDeclarados(declaracion).map((e) => [e.dispositivoId, e.secreto]),
    );
  }

  secretoDe(dispositivoId: string): string | null {
    return this.porEquipo.get(dispositivoId) ?? null;
  }
}

/**
 * C6 (15-M) · con qué secreto se escribe la ruta en la cámara, por este orden:
 *  1. el PROPIO, emitido en el alta y guardado cifrado (0045);
 *  2. el DECLARADO en `ALARM_SERVER_EQUIPOS` (la cámara que funciona hoy);
 *  3. si no hay ninguno, se EMITE uno ahora: es una cámara dada de alta antes
 *     de la 0045, y la alternativa —pedir que se edite el .env— es justo lo
 *     que este cambio retira.
 */
export class SecretosPropiosODeclarados implements SecretosDelAlarmServer {
  private readonly declarados: SecretosDeLaDeclaracion;

  constructor(
    private readonly propios: SecretosDeAlarmServer,
    declaracion: string | undefined,
  ) {
    this.declarados = new SecretosDeLaDeclaracion(declaracion);
  }

  async secretoPara(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipo: Pick<DatosDeEquipo, 'id' | 'host'>,
  ): Promise<string> {
    const propio = await this.propios.secretoDe(ctx, copropiedadId, equipo.id);
    if (propio !== null) return propio;
    const declarado = this.declarados.secretoDe(equipo.id);
    if (declarado !== null) return declarado;
    return this.propios.emitir(ctx, copropiedadId, { id: equipo.id, host: equipo.host });
  }
}
