import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import {
  EQUIPOS_ACTIVOS,
  EquiposModule,
  RegistroDeEquiposPg,
  SecretosDeAlarmServerPg,
} from '../equipos';
import { CREDENCIALES_EN_EL_EDGE } from '../comun/credenciales-en-el-edge';
import {
  FUENTE_DE_PLACAS,
  InterceptorDeCopropiedadEnCurso,
  PROVEEDOR_DE_EQUIPOS,
  RUTAS_DE_EQUIPOS,
  TUNELES_DE_EDGE,
  enHechoDelEdge,
} from '../proveedores';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { RutasDeEquipos, TunelesDeEdge } from '../proveedores';
import { AbrirTunel, AUDITORIA_DEL_TUNEL } from './aplicacion/abrir-tunel';
import type { AuditoriaDelTunel } from './aplicacion/abrir-tunel';
import { AcreditarEdge } from './aplicacion/acreditar-edge';
import { AlertaDeDesconexion } from './aplicacion/alerta-de-desconexion';
import type { AlertaParaEquipo, EquiposDelConjunto } from './aplicacion/alerta-de-desconexion';
import { PublicacionesDelEdge } from './aplicacion/publicaciones-del-edge';
import { CredencialesDelPuente } from './aplicacion/credenciales-del-puente';
import { InventarioDelEdge } from './aplicacion/inventario-del-edge';
import { MigrarCredencialesAlEdge } from './aplicacion/migrar-credenciales';
import {
  CredencialesEnLaNubePg,
  LecturaParaElEdgePg,
  huellaConLlave,
} from './infraestructura/credenciales-pg';
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
@Global() // CREDENCIALES_EN_EL_EDGE la consumen `equipos` y `guardia` (D2, E2)
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
        { provide: APP_INTERCEPTOR, useClass: InterceptorDeCopropiedadEnCurso },
        {
          provide: InventarioDelEdge,
          inject: [EQUIPOS_ACTIVOS, BITACORA],
          useFactory: (equipos: EquiposDelConjunto, bitacora: Bitacora) =>
            new InventarioDelEdge(equipos, bitacora),
        },
        {
          // D2 · sin base no hay puentes: `null`, y `equipos` y `guardia` quedan como siempre (R1).
          provide: CREDENCIALES_EN_EL_EDGE,
          inject: [Pool, CONFIGURACION, RUTAS_DE_EQUIPOS, TUNELES_DE_EDGE, BITACORA],
          useFactory: (
            pool: Pool,
            c: Configuracion,
            rutas: RutasDeEquipos,
            tuneles: TunelesDeEdge,
            bitacora: Bitacora,
          ) =>
            conBase(c)
              ? new CredencialesDelPuente(
                  rutas,
                  tuneles,
                  new LecturaParaElEdgePg(
                    new RegistroDeEquiposPg(pool, c.EQUIPOS_LLAVE),
                    new SecretosDeAlarmServerPg(pool, c.EQUIPOS_LLAVE),
                  ),
                  new CredencialesEnLaNubePg(pool, new RegistroDeEquiposPg(pool, c.EQUIPOS_LLAVE)),
                  huellaConLlave(c.EQUIPOS_LLAVE),
                  bitacora,
                )
              : null,
        },
        {
          provide: MigrarCredencialesAlEdge,
          inject: [
            Pool,
            CONFIGURACION,
            RUTAS_DE_EQUIPOS,
            TUNELES_DE_EDGE,
            PROVEEDOR_DE_EQUIPOS,
            BITACORA,
          ],
          useFactory: (
            pool: Pool,
            c: Configuracion,
            rutas: RutasDeEquipos,
            tuneles: TunelesDeEdge,
            proveedor: ProveedorDeEquipos,
            bitacora: Bitacora,
          ) => {
            const registro = new RegistroDeEquiposPg(pool, c.EQUIPOS_LLAVE);
            return new MigrarCredencialesAlEdge(
              rutas,
              tuneles,
              new LecturaParaElEdgePg(registro, new SecretosDeAlarmServerPg(pool, c.EQUIPOS_LLAVE)),
              new CredencialesEnLaNubePg(pool, registro),
              huellaConLlave(c.EQUIPOS_LLAVE),
              (id) => proveedor.olvidar?.(id),
              bitacora,
            );
          },
        },
      ],
      exports: [CREDENCIALES_EN_EL_EDGE],
    };
  }
}
