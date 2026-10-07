import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { VerificadorDeJwt } from '../autenticacion';
import { IntentosDeAcceso } from '../plataforma';
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
  ControlDeIntentos,
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
import { PROVEEDOR_DEL_CIERRE } from './composicion-del-cierre';
import { CrearCuentaPorUsuario } from './aplicacion/crear-cuenta';
import { RegistrarResidente } from './aplicacion/registrar-residente';
import {
  REGISTRO_DE_INVITACIONES,
  RegistroUnicoDeInvitaciones,
} from './aplicacion/puertos-del-registro';
import type { RegistroDeInvitaciones } from './aplicacion/puertos-del-registro';
import { CuentasSupabase } from './infraestructura/cuentas-supabase';
import { LectorDeTokenVerificado } from './infraestructura/lector-de-token';
import { IgualadorDeTiempoReal } from './infraestructura/igualador-de-tiempo';
import { RepositorioDeCuentasPg } from './infraestructura/repositorio-cuentas-pg';
import { RepositorioDeCuentasEnMemoria } from './infraestructura/repositorio-cuentas-memoria';
import { DirectorioDeCuentasPg } from './infraestructura/directorio-de-cuentas-pg';
import { CuentasController } from './presentacion/cuentas.controller';
import { RegistroController } from './presentacion/registro.controller';

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
      controllers: [CuentasController, RegistroController],
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
            IntentosDeAcceso,
          ],
          useFactory: (
            p: ProveedorDeIdentidad,
            r: RepositorioDeCuentas,
            l: LectorDeToken,
            g: GanchosDeSesion,
            t: IgualadorDeTiempo,
            // H5 (15-L) · el bloqueo temporal por (IP, identificador), con el
            // modo pruebas dentro: lo implementa el módulo de plataforma.
            i: ControlDeIntentos,
          ) => new IniciarSesion(p, r, l, g, t, i),
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
        PROVEEDOR_DEL_CIERRE, // E4 (15-R) · la revocación remota se reintenta.
        {
          provide: CrearCuentaPorUsuario,
          inject: [ADMINISTRADOR_DE_CUENTAS, REPOSITORIO_DE_CUENTAS],
          useFactory: (a: AdministradorDeCuentas, r: RepositorioDeCuentas) =>
            new CrearCuentaPorUsuario(a, r),
        },
        // 15-W (D2) · «Crear cuenta». El residente inscribe sus invitaciones al
        // arrancar; sin ellas, el registro no está disponible (falla cerrado).
        { provide: REGISTRO_DE_INVITACIONES, useClass: RegistroUnicoDeInvitaciones },
        {
          provide: RegistrarResidente,
          inject: [
            CrearCuentaPorUsuario,
            REPOSITORIO_DE_CUENTAS,
            REGISTRO_DE_INVITACIONES,
            IGUALADOR_DE_TIEMPO,
            RELOJ,
          ],
          useFactory: (
            c: CrearCuentaPorUsuario,
            r: RepositorioDeCuentas,
            i: RegistroDeInvitaciones,
            t: IgualadorDeTiempo,
            reloj: Reloj,
          ) => new RegistrarResidente(c, r, i, t, reloj),
        },
      ],
      exports: [
        GANCHOS_DE_SESION,
        REGISTRO_DE_INVITACIONES,
        DIRECTORIO_DE_CUENTAS,
        PROVEEDOR_DE_IDENTIDAD,
        CrearCuentaPorUsuario,
        RepositorioDeCuentasEnMemoria,
      ],
    };
  }
}
