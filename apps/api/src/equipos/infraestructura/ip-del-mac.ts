import { networkInterfaces } from 'node:os';
import { ipHaciaElEquipo } from '@ncr/providers';
import type { InterfazDeRed } from '@ncr/providers';
import { leerEquiposDeclarados } from '../../comun/equipos-de-alarm-server';
import type {
  ResolutorDeIpDelMac,
  SecretosDelAlarmServer,
} from '../aplicacion/configuracion-en-sitio';

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
export class SecretosDeLaDeclaracion implements SecretosDelAlarmServer {
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
