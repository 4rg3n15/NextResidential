import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import {
  AUTORIZACIONES_DEL_RESIDENTE,
  DIRECTORIO_DEL_RESIDENTE,
  NOTIFICACIONES_DEL_RESIDENTE,
  ZONAS_DEL_RESIDENTE,
} from './aplicacion/puertos';
import type {
  AutorizacionesDelResidente,
  DirectorioDelResidente,
  NotificacionesDelResidente,
  ZonasDelResidente,
} from './aplicacion/puertos';
import { DirectorioDelResidentePg } from './infraestructura/directorio-pg';
import { AutorizacionesDelResidentePg } from './infraestructura/autorizaciones-pg';
import { ZonasDelResidentePg } from './infraestructura/zonas-pg';
import { NotificacionesDelResidentePg } from './infraestructura/notificaciones-pg';
import { CrearMiAutorizacion } from './aplicacion/crear-mi-autorizacion';
import { CapturarRostroDeMiVisitante } from './aplicacion/capturar-rostro-de-mi-visitante';
import { RegistrarMiAparato, VerMisZonas } from './aplicacion/casos-de-uso-11b';
import {
  ResolverMiAmbito,
  VerMiFamilia,
  VerMiHistorial,
  VerMisAutorizaciones,
  VerMisVehiculos,
  VerMiVivienda,
} from './aplicacion/casos-de-uso';
import { BiometriaModule, CapturarRostro, EmitirEnlaceDeConsentimiento } from '../biometria';
import { MiController } from './presentacion/mi.controller';
import { MiAltaController } from './presentacion/mi-alta.controller';
import { MiHogarController } from './presentacion/mi-hogar.controller';
import {
  OcupantesDeViviendaController,
  SupervisionDeResidentesController,
} from './presentacion/supervision-de-residentes.controller';
import { PROVEEDORES_DEL_HOGAR } from './hogar.providers';

/**
 * Módulo de la superficie del residente.
 *
 * No exporta su puerto: **nadie más lee por aquí**. El padrón sigue siendo el
 * dueño de las escrituras del padrón y este módulo no las toca; lo único que
 * comparte con el resto es el ámbito del dominio, que vive en `domain-core`.
 * Que el barril no exporte nada operativo es la señal de que la frontera está
 * donde debe (§2.2).
 */
@Module({})
export class ResidenteModule {
  static registrar(): DynamicModule {
    return {
      module: ResidenteModule,
      /**
       * Se importa el MÓDULO de biometría, no sus interioridades: lo que entra
       * aquí es `CapturarRostro`, que él exporta por su barril. El residente no
       * toca la bóveda, ni los repositorios de plantillas, ni el proveedor de
       * terminales — y no podría, porque no los inyecta.
       */
      imports: [BiometriaModule.registrar()],
      controllers: [
        MiController,
        // ETAPA 15-I · primer ingreso, ocupantes, perfil, vehículos propios y
        // su supervisión por el superadministrador.
        MiAltaController,
        MiHogarController,
        SupervisionDeResidentesController,
        OcupantesDeViviendaController,
      ],
      providers: [
        ...PROVEEDORES_DEL_HOGAR,
        {
          provide: DIRECTORIO_DEL_RESIDENTE,
          inject: [Pool],
          useFactory: (pool: Pool) => new DirectorioDelResidentePg(pool, {}),
        },
        ResolverMiAmbito,
        {
          provide: VerMiVivienda,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMiVivienda(r, d),
        },
        {
          provide: VerMiFamilia,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMiFamilia(r, d),
        },
        {
          provide: VerMisVehiculos,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMisVehiculos(r, d),
        },
        {
          provide: VerMisAutorizaciones,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) =>
            new VerMisAutorizaciones(r, d),
        },
        {
          provide: AUTORIZACIONES_DEL_RESIDENTE,
          inject: [Pool],
          useFactory: (pool: Pool) => new AutorizacionesDelResidentePg(pool, {}),
        },
        {
          provide: ZONAS_DEL_RESIDENTE,
          inject: [Pool],
          useFactory: (pool: Pool) => new ZonasDelResidentePg(pool, {}),
        },
        {
          provide: NOTIFICACIONES_DEL_RESIDENTE,
          inject: [Pool],
          useFactory: (pool: Pool) => new NotificacionesDelResidentePg(pool, {}),
        },
        {
          provide: CrearMiAutorizacion,
          inject: [ResolverMiAmbito, AUTORIZACIONES_DEL_RESIDENTE, RELOJ],
          useFactory: (r: ResolverMiAmbito, a: AutorizacionesDelResidente, reloj: Reloj) =>
            new CrearMiAutorizacion(r, a, reloj),
        },
        {
          provide: CapturarRostroDeMiVisitante,
          inject: [
            ResolverMiAmbito,
            AUTORIZACIONES_DEL_RESIDENTE,
            CapturarRostro,
            EmitirEnlaceDeConsentimiento,
          ],
          useFactory: (
            r: ResolverMiAmbito,
            a: AutorizacionesDelResidente,
            c: CapturarRostro,
            e: EmitirEnlaceDeConsentimiento,
          ) => new CapturarRostroDeMiVisitante(r, a, c, e),
        },
        {
          provide: VerMisZonas,
          inject: [ResolverMiAmbito, ZONAS_DEL_RESIDENTE, RELOJ],
          useFactory: (r: ResolverMiAmbito, z: ZonasDelResidente, reloj: Reloj) =>
            new VerMisZonas(r, z, reloj),
        },
        {
          provide: RegistrarMiAparato,
          inject: [ResolverMiAmbito, NOTIFICACIONES_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, n: NotificacionesDelResidente) =>
            new RegistrarMiAparato(r, n),
        },
        {
          provide: VerMiHistorial,
          inject: [ResolverMiAmbito, DIRECTORIO_DEL_RESIDENTE],
          useFactory: (r: ResolverMiAmbito, d: DirectorioDelResidente) => new VerMiHistorial(r, d),
        },
      ],
    };
  }
}
