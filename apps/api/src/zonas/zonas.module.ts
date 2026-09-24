import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { GeneradorDeId, Reloj } from '@ncr/domain-core';
// Por el barril del módulo, nunca por su interior (§2.2): lo único que zonas
// sabe de autorizaciones es que declara este puerto y qué forma tiene.
import { RESOLUTOR_DE_ZONA } from '../autorizaciones';
import type { ResolutorDeZona } from '../autorizaciones';
import { REPOSITORIO_AUTORIZACIONES_ZONA, REPOSITORIO_ZONAS } from './aplicacion/puertos';
import type { RepositorioAutorizacionesZona, RepositorioZonas } from './aplicacion/puertos';
import {
  AutorizarZonaAVisitante,
  ConfigurarZona,
  CrearZona,
  DarDeBajaZona,
  LiberarAforo,
  ReiniciarAforosVencidos,
  ValidarAforo,
} from './aplicacion/casos-de-uso';
import { RepositorioZonasEnMemoria } from './infraestructura/repositorio-zonas-memoria';
import {
  RepositorioAutorizacionesZonaPg,
  RepositorioZonasPg,
} from './infraestructura/repositorio-zonas-pg';
import { ZonasController } from './presentacion/zonas.controller';

/**
 * Raíz de composición del módulo de zonas.
 *
 * Aquí —y solo aquí— se satisface `ResolutorDeZona`, el puerto que el módulo de
 * autorizaciones declara para poder poner la zona en el contexto del motor. Los
 * dos módulos se comunican por esa interfaz y ninguno importa código interno del
 * otro (§2.2): el de zonas no sabe que existe un motor de reglas, y el de
 * autorizaciones no sabe que hay una tabla `zona_aforo`.
 *
 * **ETAPA 15-D (P1) · los adaptadores son los de PostgreSQL.** Hasta aquí se
 * cableaba el doble en memoria «por D-17» —sin contraseña la API no se
 * conectaba— y D-17 llevaba cerrado desde la 09-B: padrón y autorizaciones ya
 * persistían de verdad mientras cada zona creada o configurada desde la consola
 * se perdía al reiniciar. El doble sigue existiendo y se sigue proveyendo por su
 * clase para que las suites sin base lo sustituyan (`test/utilidades.ts`), pero
 * ya no es lo que un despliegue usa.
 */
@Global()
@Module({})
export class ZonasModule {
  static registrar(): DynamicModule {
    const enMemoria = new RepositorioZonasEnMemoria();

    return {
      module: ZonasModule,
      controllers: [ZonasController],
      providers: [
        // Los claims viajan vacíos por el mismo motivo que en padrón: el filtro
        // de tenant lo pone la capa de aplicación en cada consulta (§2.7.6).
        {
          provide: REPOSITORIO_ZONAS,
          inject: [Pool],
          useFactory: (pool: Pool) => new RepositorioZonasPg(pool, {}),
        },
        { provide: RepositorioZonasEnMemoria, useValue: enMemoria },
        {
          provide: REPOSITORIO_AUTORIZACIONES_ZONA,
          inject: [Pool],
          useFactory: (pool: Pool) => new RepositorioAutorizacionesZonaPg(pool, {}),
        },
        {
          provide: CrearZona,
          inject: [REPOSITORIO_ZONAS, GENERADOR_DE_ID],
          useFactory: (repo: RepositorioZonas, ids: GeneradorDeId) => new CrearZona(repo, ids),
        },
        {
          provide: DarDeBajaZona,
          inject: [REPOSITORIO_ZONAS],
          useFactory: (repo: RepositorioZonas) => new DarDeBajaZona(repo),
        },
        {
          provide: ValidarAforo,
          inject: [REPOSITORIO_ZONAS, RELOJ],
          useFactory: (repo: RepositorioZonas, reloj: Reloj) => new ValidarAforo(repo, reloj),
        },
        {
          provide: LiberarAforo,
          inject: [REPOSITORIO_ZONAS],
          useFactory: (repo: RepositorioZonas) => new LiberarAforo(repo),
        },
        // D-36 · el barrido que persiste el reinicio de las zonas que nadie
        // toca. Lo invoca el planificador de la ETAPA 14, no una ruta.
        {
          provide: ReiniciarAforosVencidos,
          inject: [REPOSITORIO_ZONAS, RELOJ],
          useFactory: (repo: RepositorioZonas, reloj: Reloj) =>
            new ReiniciarAforosVencidos(repo, reloj),
        },
        {
          provide: ConfigurarZona,
          inject: [REPOSITORIO_ZONAS],
          useFactory: (repo: RepositorioZonas) => new ConfigurarZona(repo),
        },
        {
          provide: AutorizarZonaAVisitante,
          inject: [REPOSITORIO_ZONAS, REPOSITORIO_AUTORIZACIONES_ZONA],
          useFactory: (repo: RepositorioZonas, permisos: RepositorioAutorizacionesZona) =>
            new AutorizarZonaAVisitante(repo, permisos),
        },
        {
          // CU-05 · la zona entra al contexto del motor ya resuelta: si abre, si
          // está llena y si exige permiso explícito. El motor no consulta nada.
          provide: RESOLUTOR_DE_ZONA,
          inject: [REPOSITORIO_ZONAS],
          useFactory: (repo: RepositorioZonas): ResolutorDeZona => ({
            resolver: async (copropiedadId, zonaId, ahora) => {
              const zona = await repo.porId(copropiedadId, zonaId);
              if (zona === null) return null;
              const disponibilidad = zona.disponibilidadEn(ahora);
              return {
                id: zona.id,
                dentroDeHorario: disponibilidad.dentroDeHorario,
                aforoCompleto: disponibilidad.aforoCompleto,
                // Toda zona común exige permiso explícito de la autorización:
                // es lo que separa CA-15 (horario) de ZONA_NO_AUTORIZADA. Las
                // zonas de paso se modelan sin `zonaId` en la solicitud.
                restringida: true,
              };
            },
          }),
        },
      ],
      exports: [
        REPOSITORIO_ZONAS,
        REPOSITORIO_AUTORIZACIONES_ZONA,
        RESOLUTOR_DE_ZONA,
        RepositorioZonasEnMemoria,
        ValidarAforo,
        LiberarAforo,
        ReiniciarAforosVencidos,
      ],
    };
  }
}
