import { Global, Module } from '@nestjs/common';
import type { DynamicModule, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { BITACORA_DE_IDENTIDAD } from '../comun/bitacora-de-identidad';
import type { BitacoraDeIdentidad } from '../comun/bitacora-de-identidad';
import {
  CrearCuentaPorUsuario,
  DIRECTORIO_DE_CUENTAS,
  GANCHOS_DE_SESION,
  PROVEEDOR_DE_IDENTIDAD,
  RepositorioDeCuentasEnMemoria,
} from '../cuentas';
import { ControlDeIpDePorteros, REGISTRO_DE_SEGURIDAD } from '../plataforma';
import type { EventoDeSeguridad } from '../plataforma';
import type { DirectorioDeCuentas, GanchosDeSesion, ProveedorDeIdentidad } from '../cuentas';
import { REPOSITORIO_COPROPIEDADES } from '../multiempresa/repositorio-copropiedades';
import type { RepositorioCopropiedades } from '../multiempresa/repositorio-copropiedades';
import {
  CODIGO_DE_PATRULLAJE,
  REPOSITORIO_DE_PERFILES,
  REPOSITORIO_DE_POOLS,
  REPOSITORIO_DE_SESIONES,
  REPOSITORIO_DE_TURNOS,
  ZONAS_HORARIAS,
} from './aplicacion/puertos';
import type {
  CodigoDePatrullaje,
  RepositorioDePerfiles,
  RepositorioDePools,
  RepositorioDeSesiones,
  RepositorioDeTurnos,
  ZonasHorarias,
} from './aplicacion/puertos';
import { ControlDeSesiones } from './aplicacion/control-de-sesiones';
import { Patrullaje } from './aplicacion/patrullaje';
import { GestionDePorteros } from './aplicacion/porteros';
import { CalendarioDeTurnos } from './aplicacion/turnos';
import { PanelDeSupervision } from './aplicacion/supervision';
import { CodigoDePatrullajeHmac } from './infraestructura/codigo-de-patrullaje';
import { PerfilesPg, PoolsPg, TurnosPg } from './infraestructura/porteria-pg';
import { CupoDePorteros } from './aplicacion/cupo-de-porteros';
import { SesionesPg } from './infraestructura/sesiones-pg';
import {
  PerfilesEnMemoria,
  PoolsEnMemoria,
  SesionesEnMemoria,
  TurnosEnMemoria,
} from './infraestructura/porteria-en-memoria';
import { ZonasDesdeCatalogo } from './infraestructura/zonas-desde-catalogo';
import { PorteriaController } from './presentacion/porteria.controller';
import { PoolDePorterosController } from './presentacion/pool-de-porteros.controller';
import { SupervisionController } from './presentacion/supervision.controller';

const enBase = (c: Configuracion): boolean => c.PERSISTENCIA_DE_EVENTOS === 'postgres';

/**
 * Raíz de composición de portería (ADR-024). Global porque la guarda de turno
 * se registra en `app.module.ts` y necesita `ControlDeSesiones`. Se inscribe
 * al arrancar como el gancho de sesión del rol `portero` en cuentas: sin esa
 * inscripción, cuentas niega el inicio de sesión al portero (falla cerrado).
 */
@Global()
@Module({})
export class PorteriaModule implements OnModuleInit {
  constructor(
    @Inject(GANCHOS_DE_SESION) private readonly ganchos: GanchosDeSesion,
    @Inject(ControlDeSesiones) private readonly control: ControlDeSesiones,
  ) {}

  onModuleInit(): void {
    this.ganchos.inscribir('portero', this.control);
  }

  static registrar(): DynamicModule {
    return {
      module: PorteriaModule,
      // `PoolDePorterosController` ANTES que supervisión: su `PUT porteros/cupo`
      // tiene que registrarse antes que `PUT porteros/:usuarioId`, que lo
      // tomaría por un usuario y respondería 400.
      controllers: [PorteriaController, PoolDePorterosController, SupervisionController],
      providers: [
        PerfilesEnMemoria,
        TurnosEnMemoria,
        SesionesEnMemoria,
        {
          provide: REPOSITORIO_DE_PERFILES,
          inject: [CONFIGURACION, Pool, PerfilesEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: PerfilesEnMemoria) =>
            enBase(c) ? new PerfilesPg(pool) : m,
        },
        {
          provide: REPOSITORIO_DE_TURNOS,
          inject: [CONFIGURACION, Pool, TurnosEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: TurnosEnMemoria) =>
            enBase(c) ? new TurnosPg(pool) : m,
        },
        {
          provide: REPOSITORIO_DE_SESIONES,
          inject: [CONFIGURACION, Pool, SesionesEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: SesionesEnMemoria) =>
            enBase(c) ? new SesionesPg(pool) : m,
        },
        {
          provide: REPOSITORIO_DE_POOLS,
          inject: [CONFIGURACION, Pool, RepositorioDeCuentasEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: RepositorioDeCuentasEnMemoria) =>
            enBase(c) ? new PoolsPg(pool) : new PoolsEnMemoria(m),
        },
        {
          provide: CupoDePorteros,
          inject: [
            REPOSITORIO_DE_POOLS,
            REPOSITORIO_DE_PERFILES,
            DIRECTORIO_DE_CUENTAS,
            REGISTRO_DE_SEGURIDAD,
            RELOJ,
          ],
          useFactory: (
            pools: RepositorioDePools,
            p: RepositorioDePerfiles,
            d: DirectorioDeCuentas,
            seg: { registrar(e: EventoDeSeguridad): Promise<void> },
            reloj: Reloj,
          ) => new CupoDePorteros(pools, p, d, seg, reloj),
        },
        {
          provide: CODIGO_DE_PATRULLAJE,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) => new CodigoDePatrullajeHmac(c.BIOMETRIA_LLAVE),
        },
        {
          provide: ZONAS_HORARIAS,
          inject: [REPOSITORIO_COPROPIEDADES],
          useFactory: (catalogo: RepositorioCopropiedades) => new ZonasDesdeCatalogo(catalogo),
        },
        {
          provide: ControlDeSesiones,
          inject: [
            REPOSITORIO_DE_PERFILES,
            REPOSITORIO_DE_TURNOS,
            REPOSITORIO_DE_SESIONES,
            CODIGO_DE_PATRULLAJE,
            BITACORA_DE_IDENTIDAD,
            RELOJ,
            ControlDeIpDePorteros,
          ],
          useFactory: (
            p: RepositorioDePerfiles,
            t: RepositorioDeTurnos,
            s: RepositorioDeSesiones,
            codigo: CodigoDePatrullaje,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
            origen: ControlDeIpDePorteros,
          ) => new ControlDeSesiones(p, t, s, codigo, b, reloj, origen),
        },
        {
          provide: Patrullaje,
          inject: [
            ControlDeSesiones,
            REPOSITORIO_DE_SESIONES,
            CODIGO_DE_PATRULLAJE,
            PROVEEDOR_DE_IDENTIDAD,
            BITACORA_DE_IDENTIDAD,
            RELOJ,
          ],
          useFactory: (
            control: ControlDeSesiones,
            s: RepositorioDeSesiones,
            codigo: CodigoDePatrullaje,
            proveedor: ProveedorDeIdentidad,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
          ) => new Patrullaje(control, s, codigo, proveedor, b, reloj),
        },
        {
          provide: GestionDePorteros,
          inject: [
            CrearCuentaPorUsuario,
            DIRECTORIO_DE_CUENTAS,
            REPOSITORIO_DE_PERFILES,
            REPOSITORIO_DE_TURNOS,
            REPOSITORIO_DE_SESIONES,
            BITACORA_DE_IDENTIDAD,
            RELOJ,
            ControlDeSesiones,
          ],
          useFactory: (
            crear: CrearCuentaPorUsuario,
            d: DirectorioDeCuentas,
            p: RepositorioDePerfiles,
            t: RepositorioDeTurnos,
            s: RepositorioDeSesiones,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
            control: ControlDeSesiones,
          ) => new GestionDePorteros(crear, d, p, t, s, b, reloj, control),
        },
        {
          provide: CalendarioDeTurnos,
          inject: [
            REPOSITORIO_DE_TURNOS,
            REPOSITORIO_DE_PERFILES,
            ZONAS_HORARIAS,
            BITACORA_DE_IDENTIDAD,
            RELOJ,
          ],
          useFactory: (
            t: RepositorioDeTurnos,
            p: RepositorioDePerfiles,
            z: ZonasHorarias,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
          ) => new CalendarioDeTurnos(t, p, z, b, reloj),
        },
        {
          provide: PanelDeSupervision,
          inject: [BITACORA_DE_IDENTIDAD, DIRECTORIO_DE_CUENTAS],
          useFactory: (b: BitacoraDeIdentidad, d: DirectorioDeCuentas) =>
            new PanelDeSupervision(b, d),
        },
      ],
      exports: [
        ControlDeSesiones,
        REPOSITORIO_DE_PERFILES,
        REPOSITORIO_DE_TURNOS,
        REPOSITORIO_DE_SESIONES,
      ],
    };
  }
}
