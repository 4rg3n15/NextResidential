import type { Provider } from '@nestjs/common';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { PresenciaDeSuperadministrador } from '../plataforma';
import { GANCHOS_DE_SESION, PROVEEDOR_DE_IDENTIDAD } from './aplicacion/puertos';
import type { GanchosDeSesion, ProveedorDeIdentidad } from './aplicacion/puertos';
import { CerrarSesion } from './aplicacion/cerrar-sesion';
import { RevocacionConReintento } from './aplicacion/revocacion-con-reintento';

/**
 * 15-R · E4 · el cierre de sesión con la revocación remota que se reintenta:
 * si Supabase no contesta, lo local queda cerrado y la petición termina bien
 * (`aplicacion/revocacion-con-reintento.ts`).
 */
export const PROVEEDOR_DEL_CIERRE: Provider = {
  provide: CerrarSesion,
  inject: [PROVEEDOR_DE_IDENTIDAD, GANCHOS_DE_SESION, PresenciaDeSuperadministrador, BITACORA],
  useFactory: (
    p: ProveedorDeIdentidad,
    g: GanchosDeSesion,
    presencia: PresenciaDeSuperadministrador,
    b: Bitacora,
  ) => new CerrarSesion(new RevocacionConReintento(p, b), g, presencia),
};
