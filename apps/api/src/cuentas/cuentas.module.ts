import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { VerificadorDeJwt } from '../autenticacion';
import { BITACORA_DE_IDENTIDAD } from '../comun/bitacora-de-identidad';
import type { BitacoraDeIdentidad } from '../comun/bitacora-de-identidad';
import {
  ADMINISTRADOR_DE_CUENTAS,
  DIRECTORIO_DE_CUENTAS,
  GANCHOS_DE_SESION,
  IGUALADOR_DE_TIEMPO,
  LECTOR_DE_TOKEN,
  PROVEEDOR_DE_IDENTIDAD,
  REPOSITORIO_DE_CUENTAS,
} from './aplicacion/puertos';
import type {
  AdministradorDeCuentas,
  GanchosDeSesion,
  IgualadorDeTiempo,
  LectorDeToken,
  ProveedorDeIdentidad,
  RepositorioDeCuentas,
} from './aplicacion/puertos';
import { RegistroDeGanchosDeSesion } from './aplicacion/ganchos-de-sesion';
import { IniciarSesion } from './aplicacion/iniciar-sesion';
import { CambiarContrasena } from './aplicacion/cambiar-contrasena';
import { RestablecerContrasena } from './aplicacion/restablecer-contrasena';
import { CerrarSesion } from './aplicacion/cerrar-sesion';
import { CrearCuentaPorUsuario } from './aplicacion/crear-cuenta';
import { CuentasSupabase } from './infraestructura/cuentas-supabase';
import { LectorDeTokenVerificado } from './infraestructura/lector-de-token';
import { IgualadorDeTiempoReal } from './infraestructura/igualador-de-tiempo';
import { RepositorioDeCuentasPg } from './infraestructura/repositorio-cuentas-pg';
import { RepositorioDeCuentasEnMemoria } from './infraestructura/repositorio-cuentas-memoria';
import { DirectorioDeCuentasPg } from './infraestructura/directorio-de-cuentas-pg';
import { CuentasController } from './presentacion/cuentas.controller';

const enBase = (c: Configuracion): boolean => c.PERSISTENCIA_DE_EVENTOS === 'postgres';

/**
 * Raíz de composición de cuentas (ADR-023). Global porque portería crea las
 * cuentas de sus porteros con `CrearCuentaPorUsuario` y se inscribe en el
 * registro de ganchos; se registra ANTES que portería por el mismo motivo de
 * orden que `MultiempresaModule`.
 */
@Global()
@Module({})
export class CuentasModule {
  static registrar(): DynamicModule {
    return {
      module: CuentasModule,
      controllers: [CuentasController],
      providers: [
        RepositorioDeCuentasEnMemoria,
        { provide: GANCHOS_DE_SESION, useClass: RegistroDeGanchosDeSesion },
        {
          provide: CuentasSupabase,
          inject: [CONFIGURACION, BITACORA],
          useFactory: (c: Configuracion, b: Bitacora) => new CuentasSupabase(c, b),
        },
        { provide: PROVEEDOR_DE_IDENTIDAD, useExisting: CuentasSupabase },
        { provide: ADMINISTRADOR_DE_CUENTAS, useExisting: CuentasSupabase },
        {
          provide: LECTOR_DE_TOKEN,
          inject: [VerificadorDeJwt],
          useFactory: (v: VerificadorDeJwt) => new LectorDeTokenVerificado(v),
        },
        { provide: IGUALADOR_DE_TIEMPO, useClass: IgualadorDeTiempoReal },
        {
          provide: REPOSITORIO_DE_CUENTAS,
          inject: [CONFIGURACION, Pool, RepositorioDeCuentasEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, memoria: RepositorioDeCuentasEnMemoria) =>
            enBase(c) ? new RepositorioDeCuentasPg(pool) : memoria,
        },
        {
          provide: DIRECTORIO_DE_CUENTAS,
          inject: [CONFIGURACION, Pool, RepositorioDeCuentasEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, memoria: RepositorioDeCuentasEnMemoria) =>
            enBase(c) ? new DirectorioDeCuentasPg(pool) : memoria,
        },
        {
          provide: IniciarSesion,
          inject: [
            PROVEEDOR_DE_IDENTIDAD,
            REPOSITORIO_DE_CUENTAS,
            LECTOR_DE_TOKEN,
            GANCHOS_DE_SESION,
            IGUALADOR_DE_TIEMPO,
          ],
          useFactory: (
            p: ProveedorDeIdentidad,
            r: RepositorioDeCuentas,
            l: LectorDeToken,
            g: GanchosDeSesion,
            t: IgualadorDeTiempo,
          ) => new IniciarSesion(p, r, l, g, t),
        },
        {
          provide: CambiarContrasena,
          inject: [
            PROVEEDOR_DE_IDENTIDAD,
            ADMINISTRADOR_DE_CUENTAS,
            REPOSITORIO_DE_CUENTAS,
            BITACORA_DE_IDENTIDAD,
            RELOJ,
          ],
          useFactory: (
            p: ProveedorDeIdentidad,
            a: AdministradorDeCuentas,
            r: RepositorioDeCuentas,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
          ) => new CambiarContrasena(p, a, r, b, reloj),
        },
        {
          provide: RestablecerContrasena,
          inject: [
            ADMINISTRADOR_DE_CUENTAS,
            REPOSITORIO_DE_CUENTAS,
            GANCHOS_DE_SESION,
            BITACORA_DE_IDENTIDAD,
            RELOJ,
          ],
          useFactory: (
            a: AdministradorDeCuentas,
            r: RepositorioDeCuentas,
            g: GanchosDeSesion,
            b: BitacoraDeIdentidad,
            reloj: Reloj,
          ) => new RestablecerContrasena(a, r, g, b, reloj),
        },
        {
          provide: CerrarSesion,
          inject: [PROVEEDOR_DE_IDENTIDAD, GANCHOS_DE_SESION],
          useFactory: (p: ProveedorDeIdentidad, g: GanchosDeSesion) => new CerrarSesion(p, g),
        },
        {
          provide: CrearCuentaPorUsuario,
          inject: [ADMINISTRADOR_DE_CUENTAS, REPOSITORIO_DE_CUENTAS],
          useFactory: (a: AdministradorDeCuentas, r: RepositorioDeCuentas) =>
            new CrearCuentaPorUsuario(a, r),
        },
      ],
      exports: [
        GANCHOS_DE_SESION,
        DIRECTORIO_DE_CUENTAS,
        PROVEEDOR_DE_IDENTIDAD,
        CrearCuentaPorUsuario,
        RepositorioDeCuentasEnMemoria,
      ],
    };
  }
}
