import type { NetworkInterfaceInfo } from 'node:os';

export declare const candidatoDeEsteEquipo: (
  ip: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
) => { readonly propio: boolean; readonly frase: string };

export declare const comprobarPuertoWebrtc: (
  ip: string,
  puerto: number,
  plazoMs?: number,
) => Promise<{ readonly ok: boolean; readonly frase: string }>;
