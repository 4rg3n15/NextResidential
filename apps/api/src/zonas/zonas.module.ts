import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
// Por el barril del módulo, nunca por su interior (§2.2): lo único que zonas
// sabe de autorizaciones es que declara este puerto y qué forma tiene.
import { RESOLUTOR_DE_ZONA } from '../autorizaciones';
import type { ResolutorDeZona } from '../autorizaciones';
import { REPOSITORIO_AUTORIZACIONES_ZONA, REPOSITORIO_ZONAS } from './aplicacion/puertos';
import type { RepositorioAutorizacionesZona, RepositorioZonas } from './aplicacion/puertos';
import {
  AutorizarZonaAVisitante,
  ConfigurarZona,
  LiberarAforo,
  ValidarAforo,
} from './aplicacion/casos-de-uso';
import { RepositorioZonasEnMemoria } from './infraestructura/repositorio-zonas-memoria';
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
 * **Por qué los adaptadores son los de memoria.** Sin contraseña de PostgreSQL
 * (D-17) la API no puede conectarse en tiempo de ejecución. `RepositorioZonasPg`
 * existe, cumple el mismo puerto y se prueba contra una base real —incluida la
 * prueba de concurrencia que demuestra el aforo—; lo que se elige aquí es qué se
 * cablea, no qué se construyó.
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
        { provide: REPOSITORIO_ZONAS, useValue: enMemoria },
        { provide: RepositorioZonasEnMemoria, useValue: enMemoria },
        { provide: REPOSITORIO_AUTORIZACIONES_ZONA, useValue: enMemoria.permisosDeZona },
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
      ],
    };
  }
}
