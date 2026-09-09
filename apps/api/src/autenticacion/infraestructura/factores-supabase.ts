import { Inject, Injectable } from '@nestjs/common';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import type { AdministradorDeFactores } from '../aplicacion/puertos';

interface FactorRemoto {
  id: string;
  status: string;
  factor_type: string;
}

/**
 * Retirada de factores contra la API de administración de Supabase Auth.
 *
 * **Es el único punto del sistema que usa la llave secreta contra el proveedor
 * de identidad**, y por eso hace exactamente una cosa. La llave se lee de la
 * configuración validada y no se registra nunca, ni en un error.
 *
 * No se pide «sin caché»: son peticiones POST/DELETE y un GET de
 * administración autenticado con la llave secreta, que ningún intermediario de
 * este camino cachea. El `lib` de la API tampoco incluye DOM, así que ni
 * `RequestInit.cache` ni `HeadersInit` existen aquí — el `fetch` es el de Node.
 *
 * Se retiran solo los factores **verificados**: uno a medio inscribir no es lo
 * que impide entrar a nadie, y borrarlo escondería una inscripción abandonada
 * que conviene ver.
 */
@Injectable()
export class FactoresSupabase implements AdministradorDeFactores {
  constructor(
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  private cabeceras(): Record<string, string> {
    return {
      apikey: this.config.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${this.config.SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  async retirarFactoresVerificados(authUserId: string): Promise<number> {
    const base = this.config.SUPABASE_URL.replace(/\/+$/, '');
    const listado = await fetch(`${base}/auth/v1/admin/users/${authUserId}/factors`, {
      headers: this.cabeceras(),
    });
    if (!listado.ok) {
      // El motivo va a la bitácora; al cliente, nada que le permita distinguir
      // «no existe ese usuario» de «falló el proveedor».
      this.bitacora.registrar('error', 'no se pudieron listar los factores', {
        estado: listado.status,
      });
      throw new Error('No se pudo contactar con el proveedor de identidad');
    }

    const cuerpo = (await listado.json()) as FactorRemoto[] | { factors?: FactorRemoto[] };
    const factores = Array.isArray(cuerpo) ? cuerpo : (cuerpo.factors ?? []);
    const verificados = factores.filter((f) => f.status === 'verified');

    let retirados = 0;
    for (const factor of verificados) {
      const respuesta = await fetch(
        `${base}/auth/v1/admin/users/${authUserId}/factors/${factor.id}`,
        { method: 'DELETE', headers: this.cabeceras() },
      );
      if (respuesta.ok) retirados += 1;
      else {
        this.bitacora.registrar('error', 'no se pudo retirar un factor', {
          estado: respuesta.status,
        });
      }
    }
    return retirados;
  }
}
