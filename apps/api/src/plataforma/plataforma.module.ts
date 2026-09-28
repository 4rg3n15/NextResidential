import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { ModoPruebas } from './aplicacion/modo-pruebas';
import { ControlDeIpDePorteros } from './aplicacion/control-de-ip';
import { IntentosDeAcceso, PresenciaDeSuperadministrador } from './aplicacion/presencia-y-intentos';
import {
  AJUSTES_DE_PLATAFORMA,
  REGISTRO_DE_PRESENCIA,
  REGISTRO_DE_SEGURIDAD,
  REPOSITORIO_DE_REGLAS_DE_IP,
} from './aplicacion/puertos';
import type {
  AjustesDePlataforma,
  RegistroDePresencia,
  RegistroDeSeguridad,
  RepositorioDeReglasDeIp,
} from './aplicacion/puertos';
import {
  AjustesDePlataformaPg,
  RegistroDePresenciaPg,
  RegistroDeSeguridadPg,
  ReglasDeIpPg,
} from './infraestructura/plataforma-pg';
import {
  AjustesDePlataformaEnMemoria,
  RegistroDePresenciaEnMemoria,
  RegistroDeSeguridadEnMemoria,
  ReglasDeIpEnMemoria,
} from './infraestructura/plataforma-en-memoria';
import { GuardaDeOrigen } from './presentacion/guarda-de-origen';
import { PlataformaController } from './presentacion/plataforma.controller';

const enBase = (c: Configuracion): boolean => c.PERSISTENCIA_DE_EVENTOS === 'postgres';
const reloj = (r: Reloj) => (): number => r.ahora().getTime();

/**
 * PLATAFORMA · ETAPA 15-L (H) · ADR-031. Global: la guarda de origen la
 * registra `app.module.ts` para todas las rutas, y cuentas y portería usan el
 * modo pruebas, los intentos y la regla de IP.
 */
@Global()
@Module({})
export class PlataformaModule {
  static registrar(): DynamicModule {
    return {
      module: PlataformaModule,
      controllers: [PlataformaController],
      providers: [
        AjustesDePlataformaEnMemoria,
        ReglasDeIpEnMemoria,
        RegistroDePresenciaEnMemoria,
        RegistroDeSeguridadEnMemoria,
        {
          provide: AJUSTES_DE_PLATAFORMA,
          inject: [CONFIGURACION, Pool, AjustesDePlataformaEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: AjustesDePlataformaEnMemoria) =>
            enBase(c) ? new AjustesDePlataformaPg(pool) : m,
        },
        {
          provide: REPOSITORIO_DE_REGLAS_DE_IP,
          inject: [CONFIGURACION, Pool, ReglasDeIpEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: ReglasDeIpEnMemoria) =>
            enBase(c) ? new ReglasDeIpPg(pool) : m,
        },
        {
          provide: REGISTRO_DE_PRESENCIA,
          inject: [CONFIGURACION, Pool, RegistroDePresenciaEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: RegistroDePresenciaEnMemoria) =>
            enBase(c) ? new RegistroDePresenciaPg(pool) : m,
        },
        {
          provide: REGISTRO_DE_SEGURIDAD,
          inject: [CONFIGURACION, Pool, RegistroDeSeguridadEnMemoria],
          useFactory: (c: Configuracion, pool: Pool, m: RegistroDeSeguridadEnMemoria) =>
            enBase(c) ? new RegistroDeSeguridadPg(pool) : m,
        },
        {
          provide: ModoPruebas,
          inject: [AJUSTES_DE_PLATAFORMA, RELOJ],
          useFactory: (a: AjustesDePlataforma, r: Reloj) => new ModoPruebas(a, reloj(r)),
        },
        {
          provide: PresenciaDeSuperadministrador,
          inject: [REGISTRO_DE_PRESENCIA, RELOJ],
          useFactory: (p: RegistroDePresencia, r: Reloj) =>
            new PresenciaDeSuperadministrador(p, reloj(r)),
        },
        {
          provide: ControlDeIpDePorteros,
          inject: [
            REPOSITORIO_DE_REGLAS_DE_IP,
            REGISTRO_DE_PRESENCIA,
            ModoPruebas,
            REGISTRO_DE_SEGURIDAD,
            RELOJ,
          ],
          useFactory: (
            reglas: RepositorioDeReglasDeIp,
            presencia: RegistroDePresencia,
            modo: ModoPruebas,
            seguridad: RegistroDeSeguridad,
            r: Reloj,
          ) => new ControlDeIpDePorteros(reglas, presencia, modo, seguridad, reloj(r)),
        },
        {
          provide: IntentosDeAcceso,
          inject: [REGISTRO_DE_SEGURIDAD, ModoPruebas, RELOJ],
          useFactory: (s: RegistroDeSeguridad, modo: ModoPruebas, r: Reloj) =>
            new IntentosDeAcceso(s, modo, reloj(r)),
        },
        GuardaDeOrigen,
      ],
      exports: [
        ModoPruebas,
        ControlDeIpDePorteros,
        PresenciaDeSuperadministrador,
        IntentosDeAcceso,
        GuardaDeOrigen,
        REPOSITORIO_DE_REGLAS_DE_IP,
        REGISTRO_DE_SEGURIDAD,
        AJUSTES_DE_PLATAFORMA,
        ReglasDeIpEnMemoria,
      ],
    };
  }
}
