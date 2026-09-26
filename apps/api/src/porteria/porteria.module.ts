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
} from '../cuentas';
import type { DirectorioDeCuentas, GanchosDeSesion, ProveedorDeIdentidad } from '../cuentas';
import { REPOSITORIO_COPROPIEDADES } from '../multiempresa/repositorio-copropiedades';
import type { RepositorioCopropiedades } from '../multiempresa/repositorio-copropiedades';
import {
  CODIGO_DE_PATRULLAJE,
  REPOSITORIO_DE_PERFILES,
  REPOSITORIO_DE_SESIONES,
  REPOSITORIO_DE_TURNOS,
  ZONAS_HORARIAS,
} from './aplicacion/puertos';
import type {
  CodigoDePatrullaje,
  RepositorioDePerfiles,
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
import { PerfilesPg, TurnosPg } from './infraestructura/porteria-pg';
import { SesionesPg } from './infraestructura/sesiones-pg';
import {
  PerfilesEnMemoria,
  SesionesEnMemoria,
  TurnosEnMemoria,
} from './infraestructura/porteria-en-memoria';
import { ZonasDesdeCatalogo } from './infraestructura/zonas-desde-catalogo';
import { PorteriaController } from './presentacion/porteria.controller';
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
      controllers: [PorteriaController, SupervisionController],
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
          ],
          useFactory: (
            p: RepositorioDePerfiles,
            t: RepositorioDeTurnos,
            s: RepositorioDeSesiones,
            codigo: CodigoDePatrullaje,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
          ) => new ControlDeSesiones(p, t, s, codigo, b, reloj),
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
          ],
          useFactory: (
            crear: CrearCuentaPorUsuario,
            d: DirectorioDeCuentas,
            p: RepositorioDePerfiles,
            t: RepositorioDeTurnos,
            s: RepositorioDeSesiones,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
          ) => new GestionDePorteros(crear, d, p, t, s, b, reloj),
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
