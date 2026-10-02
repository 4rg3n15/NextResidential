import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { FuenteDePlacas } from '@ncr/providers';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { ACTOR_INGESTA } from '../comun/actores-de-servicio';
import { REGISTRO_AUDITORIA } from '../comun/auditoria/registro';
import type { RegistroDeAuditoria } from '../comun/auditoria/registro';
import { ALERTAS_DE_EQUIPO } from '../eventos';
import { EQUIPOS_ACTIVOS, EquiposModule } from '../equipos';
import {
  FUENTE_DE_PLACAS,
  RUTAS_DE_EQUIPOS,
  TUNELES_DE_EDGE,
  enHechoDelEdge,
} from '../proveedores';
import type { RutasDeEquipos, TunelesDeEdge } from '../proveedores';
import { AbrirTunel, AUDITORIA_DEL_TUNEL } from './aplicacion/abrir-tunel';
import type { AuditoriaDelTunel } from './aplicacion/abrir-tunel';
import { AcreditarEdge } from './aplicacion/acreditar-edge';
import { AlertaDeDesconexion } from './aplicacion/alerta-de-desconexion';
import type { AlertaParaEquipo, EquiposDelConjunto } from './aplicacion/alerta-de-desconexion';
import { PublicacionesDelEdge } from './aplicacion/publicaciones-del-edge';
import { REPOSITORIO_DE_PUENTES } from './aplicacion/puentes';
import type { RepositorioDePuentes } from './aplicacion/puentes';
import { REPOSITORIO_DE_GATEWAYS } from './aplicacion/puertos';
import type { RepositorioDeGateways } from './aplicacion/puertos';
import { EdgeModule } from './edge.module';
import {
  AuditoriaDelTunelEnMemoria,
  AuditoriaDelTunelPg,
} from './infraestructura/auditoria-del-tunel';
import { PuentesEnMemoria } from './infraestructura/puentes-en-memoria';
import { PuentesPg } from './infraestructura/puentes-pg';
import { PuentesController } from './presentacion/puentes.controller';
import { PuertaDelTunel } from './presentacion/puerta-del-tunel';

/**
 * Raíz de composición del túnel Edge → API (15-Q2, ADR-035). Módulo propio y no
 * más proveedores en `EdgeModule`: la identidad del Edge (15-Q) no cambia, y el
 * túnel se monta encima de ella. Con base, PostgreSQL; sin ella, los dobles —y
 * ningún Edge es puente: todo va directo (R1)—.
 */
@Module({})
export class TunelDelEdgeModule {
  static registrar(): DynamicModule {
    const conBase = (c: Configuracion): boolean => c.PERSISTENCIA_DE_EVENTOS === 'postgres';
    return {
      module: TunelDelEdgeModule,
      imports: [EdgeModule.registrar(), EquiposModule.registrar()],
      controllers: [PuentesController],
      providers: [
        {
          provide: REPOSITORIO_DE_PUENTES,
          inject: [Pool, CONFIGURACION],
          useFactory: (pool: Pool, c: Configuracion): RepositorioDePuentes =>
            conBase(c) ? new PuentesPg(pool) : new PuentesEnMemoria(),
        },
        {
          provide: AUDITORIA_DEL_TUNEL,
          inject: [Pool, CONFIGURACION, BITACORA],
          useFactory: (pool: Pool, c: Configuracion, bitacora: Bitacora): AuditoriaDelTunel =>
            conBase(c) ? new AuditoriaDelTunelPg(pool, bitacora) : new AuditoriaDelTunelEnMemoria(),
        },
        {
          provide: AbrirTunel,
          inject: [
            REPOSITORIO_DE_GATEWAYS,
            REGISTRO_AUDITORIA,
            REPOSITORIO_DE_PUENTES,
            AUDITORIA_DEL_TUNEL,
            TUNELES_DE_EDGE,
            RELOJ,
            BITACORA,
            CONFIGURACION,
          ],
          useFactory: (
            gateways: RepositorioDeGateways,
            auditoria: RegistroDeAuditoria,
            puentes: RepositorioDePuentes,
            delTunel: AuditoriaDelTunel,
            tuneles: TunelesDeEdge,
            reloj: Reloj,
            bitacora: Bitacora,
            c: Configuracion,
          ) =>
            new AbrirTunel(
              // La MISMA acreditación de la 15-Q: misma maestra, misma ventana.
              new AcreditarEdge(gateways, auditoria, bitacora, reloj, {
                maestra: c.INGESTA_FIRMA_SECRETO,
                ventanaSegundos: c.INGESTA_VENTANA_SEGUNDOS,
              }),
              puentes,
              delTunel,
              tuneles,
              reloj,
              bitacora,
              c.INGESTA_VENTANA_SEGUNDOS,
            ),
        },
        {
          provide: PublicacionesDelEdge,
          inject: [FUENTE_DE_PLACAS, RUTAS_DE_EQUIPOS, REGISTRO_AUDITORIA, BITACORA],
          useFactory: (
            fuente: FuenteDePlacas,
            rutas: RutasDeEquipos,
            auditoria: RegistroDeAuditoria,
            bitacora: Bitacora,
          ) => new PublicacionesDelEdge(fuente, rutas, auditoria, enHechoDelEdge, bitacora),
        },
        {
          provide: AlertaDeDesconexion,
          inject: [TUNELES_DE_EDGE, EQUIPOS_ACTIVOS, ALERTAS_DE_EQUIPO, BITACORA],
          useFactory: (
            tuneles: TunelesDeEdge,
            equipos: EquiposDelConjunto,
            alertas: AlertaParaEquipo,
            bitacora: Bitacora,
          ) => {
            const alerta = new AlertaDeDesconexion(
              tuneles,
              equipos,
              alertas,
              ACTOR_INGESTA,
              bitacora,
            );
            alerta.vigilar();
            return alerta;
          },
        },
        PuertaDelTunel,
      ],
    };
  }
}
