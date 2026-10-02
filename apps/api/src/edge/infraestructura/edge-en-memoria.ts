import { randomUUID } from 'node:crypto';
import type { ContextoTenant } from '../../autenticacion';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { UMBRAL_CONFIANZA_PLACA_FRACCION } from '../../multiempresa/configuracion';
import type {
  FuenteDeReglas,
  GatewayRegistrado,
  LecturasDeReglas,
  PublicadorDeVersiones,
  RepositorioDeGateways,
  VersionPublicada,
} from '../aplicacion/puertos';
import { referenciaDeGeneracion, siguienteReferencia } from './referencia-de-credencial';

/**
 * Los dobles en memoria del módulo `edge`: lo que se cablea sin base
 * (`PERSISTENCIA_DE_EVENTOS=memoria`, la suite sin PostgreSQL) y lo que usan
 * las pruebas de la aplicación. Se comportan como la base en lo que importa:
 * la versión es consecutiva por copropiedad y un número ya publicado no se
 * vuelve a publicar (el índice único de la 0010).
 */

export class GatewaysEnMemoria implements RepositorioDeGateways {
  readonly gateways = new Map<string, GatewayRegistrado>();
  readonly descargas: { edgeId: string; version: number; ahora: Date }[] = [];

  async porId(id: string): Promise<GatewayRegistrado | null> {
    return this.gateways.get(id) ?? null;
  }

  async anotarDescarga(gateway: GatewayRegistrado, version: number, ahora: Date): Promise<void> {
    this.descargas.push({ edgeId: gateway.id, version, ahora });
  }

  async registrar(
    _ctx: ContextoTenant,
    copropiedadId: string,
    nombre: string,
  ): Promise<GatewayRegistrado> {
    const gateway: GatewayRegistrado = {
      id: randomUUID(),
      copropiedadId,
      nombre,
      usuarioServicioId: ACTOR_INGESTA,
      credencialRef: referenciaDeGeneracion(1),
      activo: true,
    };
    this.gateways.set(gateway.id, gateway);
    return gateway;
  }

  async rotar(
    _ctx: ContextoTenant,
    copropiedadId: string,
    edgeId: string,
  ): Promise<GatewayRegistrado | null> {
    const actual = this.gateways.get(edgeId);
    if (actual === undefined || actual.copropiedadId !== copropiedadId || !actual.activo) {
      return null;
    }
    const rotado = { ...actual, credencialRef: siguienteReferencia(actual.credencialRef) };
    this.gateways.set(edgeId, rotado);
    return rotado;
  }
}

export class VersionesEnMemoria implements PublicadorDeVersiones {
  readonly publicadas = new Map<string, VersionPublicada[]>();

  async ultima(copropiedadId: string): Promise<VersionPublicada | null> {
    return this.publicadas.get(copropiedadId)?.at(-1) ?? null;
  }

  async publicar(copropiedadId: string, version: VersionPublicada): Promise<boolean> {
    const lista = this.publicadas.get(copropiedadId) ?? [];
    if (version.numero !== lista.length + 1) return false;
    this.publicadas.set(copropiedadId, [...lista, version]);
    return true;
  }
}

/**
 * Sin base no hay de dónde leer reglas: la instantánea sale VACÍA, y con ella
 * el Edge niega todo lo que no conoce. Es exactamente lo que hace el cargador
 * conservador de la nube sin base (D-25): denegar, no inventar.
 */
export class FuenteDeReglasVacia implements FuenteDeReglas {
  async leer(): Promise<LecturasDeReglas> {
    return {
      autorizaciones: [],
      vehiculos: [],
      viviendasActivas: [],
      vetos: [],
      zonas: [],
      plantillas: [],
      umbralDeConfianza: UMBRAL_CONFIANZA_PLACA_FRACCION,
    };
  }
}
