import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { AmbitoDelResidente, ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · B3 · EL RESIDENTE SUSCRIBE SU NAVEGADOR A LOS AVISOS DE SU VIVIENDA
 *
 * Relación con `/mi/notificaciones/aparatos` (HU-34, 11-B): MISMA tabla, otra
 * forma de dato. Aquella ruta guarda el token de un aparato nativo —que desde
 * ADR-036 no tiene emisor: no hay servicio de mensajería nativo—; ésta guarda
 * la suscripción Web Push de un navegador (endpoint + dos llaves), que es la
 * única que recibe avisos. No hay tabla paralela ni segundo registro.
 *
 * La vivienda NO viene del cliente: la resuelve `ResolverMiAmbito` desde la
 * identidad. Así es imposible suscribirse a la casa del vecino aunque se
 * conozca su identificador (y la RLS de la 0052 lo impide también abajo).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SUSCRIPCIONES_DEL_NAVEGADOR = Symbol('SUSCRIPCIONES_DEL_NAVEGADOR');
export const POLITICA_DE_AVISOS_WEB = Symbol('POLITICA_DE_AVISOS_WEB');

export interface SuscripcionDelNavegador {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface SuscripcionesDelNavegador {
  /** `endpoint_de_otra_cuenta`: ese navegador ya está suscrito por otra cuenta de OTRO conjunto. */
  suscribir(
    ambito: AmbitoDelResidente,
    usuarioId: string,
    s: SuscripcionDelNavegador,
  ): Promise<{ readonly id: string } | 'endpoint_de_otra_cuenta'>;
  /** Baja lógica de la suscripción de ESTE usuario con ese endpoint. */
  anular(ambito: AmbitoDelResidente, usuarioId: string, endpoint: string): Promise<boolean>;
}

/** Lo que la configuración dice de los avisos: la llave pública y a quién se envía. */
export interface PoliticaDeAvisosWeb {
  readonly clavePublica: string | null;
  permitido(endpoint: string): boolean;
}

export interface EstadoDeAvisosWeb {
  readonly disponible: boolean;
  readonly clavePublica: string | null;
}

/** Se construye por fábrica (`web-push.providers.ts`), como los demás casos de uso. */
export class AvisosWebDelResidente {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    private readonly suscripciones: SuscripcionesDelNavegador,
    private readonly politica: PoliticaDeAvisosWeb,
  ) {}

  /** Lo que la consola necesita para pedir permiso y suscribirse. */
  async estado(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<EstadoDeAvisosWeb, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const clave = this.politica.clavePublica;
    return exito({ disponible: clave !== null, clavePublica: clave });
  }

  async suscribir(
    ctx: ContextoTenant,
    copropiedadId: string,
    s: SuscripcionDelNavegador,
  ): Promise<Resultado<{ readonly id: string }, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    if (this.politica.clavePublica === null) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'Los avisos al teléfono no están activos'),
      );
    }
    // SSRF: el endpoint lo da el navegador; sólo servicios de push conocidos.
    if (!this.politica.permitido(s.endpoint)) {
      return fallo(errorDominio('DATO_INVALIDO', 'El endpoint no es de un servicio de push'));
    }
    const hecho = await this.suscripciones.suscribir(r.valor.ambito, ctx.usuarioId, s);
    if (hecho === 'endpoint_de_otra_cuenta') {
      return fallo(
        errorDominio(
          'CONFLICTO_DE_CONCURRENCIA',
          'Este navegador recibe los avisos de otra cuenta: cierre aquella sesión primero',
        ),
      );
    }
    return exito(hecho);
  }

  async anular(
    ctx: ContextoTenant,
    copropiedadId: string,
    endpoint: string,
  ): Promise<Resultado<{ readonly anulada: boolean }, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    return exito({
      anulada: await this.suscripciones.anular(r.valor.ambito, ctx.usuarioId, endpoint),
    });
  }
}
