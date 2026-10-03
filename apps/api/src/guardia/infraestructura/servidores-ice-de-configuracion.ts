import { createHmac } from 'node:crypto';
import type { FactoryProvider } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import { SERVIDORES_ICE } from '../aplicacion/servidores-ice';
import type {
  ServidorIce,
  ServidoresIce,
  ServidoresIceDeUnUsuario,
} from '../aplicacion/servidores-ice';

export interface ConfiguracionDeIce {
  readonly WEBRTC_STUN_URLS?: readonly string[] | undefined;
  readonly WEBRTC_TURN_URLS?: readonly string[] | undefined;
  readonly WEBRTC_TURN_SECRETO?: string | undefined;
  readonly WEBRTC_TURN_TTL_SEGUNDOS?: number | undefined;
}

export const TTL_POR_OMISION_S = 600;

/**
 * 15-Q2 · E2 · la credencial EFÍMERA del TURN, por el mecanismo REST de coturn
 * (`use-auth-secret` + `static-auth-secret`): usuario `<expira>:<usuarioId>` y
 * clave `base64(HMAC-SHA1(secreto, usuario))`. El TURN la comprueba con el
 * mismo secreto y la rechaza cuando `<expira>` pasó. El secreto no viaja: lo
 * que la consola recibe deja de servir solo, y está atado a quien lo pidió.
 */
export const credencialTurn = (
  secreto: string,
  usuarioId: string,
  expiraEnSegundos: number,
): { readonly username: string; readonly credential: string } => {
  const username = `${String(expiraEnSegundos)}:${usuarioId}`;
  return { username, credential: createHmac('sha1', secreto).update(username).digest('base64') };
};

export class ServidoresIceDeConfiguracion implements ServidoresIce {
  constructor(
    private readonly c: ConfiguracionDeIce,
    private readonly reloj: Reloj,
  ) {}

  para(usuarioId: string): ServidoresIceDeUnUsuario {
    const ttlSegundos = this.c.WEBRTC_TURN_TTL_SEGUNDOS ?? TTL_POR_OMISION_S;
    const servidores: ServidorIce[] = [];
    if (this.c.WEBRTC_STUN_URLS !== undefined) servidores.push({ urls: this.c.WEBRTC_STUN_URLS });
    const { WEBRTC_TURN_URLS: turn, WEBRTC_TURN_SECRETO: secreto } = this.c;
    if (turn !== undefined && secreto !== undefined) {
      const expira = Math.floor(this.reloj.ahora().getTime() / 1000) + ttlSegundos;
      servidores.push({ urls: turn, ...credencialTurn(secreto, usuarioId, expira) });
    }
    return { iceServers: servidores, ttlSegundos };
  }
}

export const PROVEEDOR_DE_SERVIDORES_ICE: FactoryProvider<ServidoresIce> = {
  provide: SERVIDORES_ICE,
  inject: [CONFIGURACION, RELOJ],
  useFactory: (c: ConfiguracionDeIce, reloj: Reloj) => new ServidoresIceDeConfiguracion(c, reloj),
};
