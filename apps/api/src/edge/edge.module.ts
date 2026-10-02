import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { REGISTRO_AUDITORIA } from '../comun/auditoria/registro';
import type { RegistroDeAuditoria } from '../comun/auditoria/registro';
import { REPOSITORIO_ZONAS } from '../zonas';
import type { RepositorioZonas } from '../zonas';
import { REPOSITORIO_COPROPIEDADES } from '../multiempresa/repositorio-copropiedades';
import type { RepositorioCopropiedades } from '../multiempresa/repositorio-copropiedades';
import { AcreditarEdge } from './aplicacion/acreditar-edge';
import { PublicarInstantanea } from './aplicacion/publicar-instantanea';
import {
  FUENTE_DE_REGLAS,
  PUBLICADOR_DE_VERSIONES,
  REPOSITORIO_DE_GATEWAYS,
} from './aplicacion/puertos';
import type {
  FuenteDeReglas,
  PublicadorDeVersiones,
  RepositorioDeGateways,
} from './aplicacion/puertos';
import {
  FuenteDeReglasVacia,
  GatewaysEnMemoria,
  VersionesEnMemoria,
} from './infraestructura/edge-en-memoria';
import { FuenteDeReglasPg } from './infraestructura/fuente-de-reglas-pg';
import { GatewaysPg } from './infraestructura/gateways-pg';
import { VersionesPg } from './infraestructura/versiones-pg';
import { EdgeController } from './presentacion/edge.controller';
import { GatewaysController } from './presentacion/gateways.controller';
import { GuardiaDelEdge } from './presentacion/guardia-del-edge';

/**
 * Raíz de composición del módulo `edge` (15-Q). Con base, PostgreSQL; sin ella
 * (`memoria`, la suite sin PostgreSQL), los dobles: ningún Edge registrado —toda
 * petición es 401— y una instantánea vacía, que niega todo lo que no conoce.
 *
 * Las reglas se leen de la base sólo con `CARGADOR_DE_CONTEXTO=postgres`, el
 * mismo interruptor que decide si la NUBE lee de la base para decidir: el
 * Edge y la nube deciden con lo mismo o con nada, nunca con cosas distintas.
 */
@Module({})
export class EdgeModule {
  static registrar(): DynamicModule {
    return {
      module: EdgeModule,
      controllers: [EdgeController, GatewaysController],
      providers: [
        {
          provide: REPOSITORIO_DE_GATEWAYS,
          inject: [Pool, CONFIGURACION],
          useFactory: (pool: Pool, c: Configuracion): RepositorioDeGateways =>
            c.PERSISTENCIA_DE_EVENTOS === 'postgres'
              ? new GatewaysPg(pool)
              : new GatewaysEnMemoria(),
        },
        {
          provide: PUBLICADOR_DE_VERSIONES,
          inject: [Pool, CONFIGURACION],
          useFactory: (pool: Pool, c: Configuracion): PublicadorDeVersiones =>
            c.PERSISTENCIA_DE_EVENTOS === 'postgres'
              ? new VersionesPg(pool)
              : new VersionesEnMemoria(),
        },
        {
          provide: FUENTE_DE_REGLAS,
          inject: [Pool, CONFIGURACION, REPOSITORIO_ZONAS, REPOSITORIO_COPROPIEDADES, BITACORA],
          useFactory: (
            pool: Pool,
            c: Configuracion,
            zonas: RepositorioZonas,
            copropiedades: RepositorioCopropiedades,
            bitacora: Bitacora,
          ): FuenteDeReglas =>
            c.CARGADOR_DE_CONTEXTO === 'postgres'
              ? new FuenteDeReglasPg(pool, zonas, copropiedades, bitacora)
              : new FuenteDeReglasVacia(),
        },
        {
          provide: AcreditarEdge,
          inject: [REPOSITORIO_DE_GATEWAYS, REGISTRO_AUDITORIA, BITACORA, RELOJ, CONFIGURACION],
          useFactory: (
            gateways: RepositorioDeGateways,
            auditoria: RegistroDeAuditoria,
            bitacora: Bitacora,
            reloj: Reloj,
            c: Configuracion,
          ) =>
            new AcreditarEdge(gateways, auditoria, bitacora, reloj, {
              maestra: c.INGESTA_FIRMA_SECRETO,
              ventanaSegundos: c.INGESTA_VENTANA_SEGUNDOS,
            }),
        },
        {
          provide: PublicarInstantanea,
          inject: [
            FUENTE_DE_REGLAS,
            PUBLICADOR_DE_VERSIONES,
            REPOSITORIO_DE_GATEWAYS,
            RELOJ,
            BITACORA,
          ],
          useFactory: (
            fuente: FuenteDeReglas,
            versiones: PublicadorDeVersiones,
            gateways: RepositorioDeGateways,
            reloj: Reloj,
            bitacora: Bitacora,
          ) => new PublicarInstantanea(fuente, versiones, gateways, reloj, bitacora),
        },
        GuardiaDelEdge,
      ],
      exports: [REPOSITORIO_DE_GATEWAYS],
    };
  }
}
