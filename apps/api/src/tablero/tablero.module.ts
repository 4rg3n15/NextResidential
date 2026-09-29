import { Module } from '@nestjs/common';
import { EquiposModule, LECTOR_DE_SENALES } from '../equipos';
import type { LectorDeSenales } from '../equipos';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { REPOSITORIO_ALERTAS, REPOSITORIO_EVENTOS } from '../eventos';
import type { RepositorioAlertas, RepositorioEventos } from '../eventos';
import {
  ConsultarAccesosPorHora,
  ConsultarDispositivos,
  ConsultarIndicadores,
} from './aplicacion/casos-de-uso';
import { REPOSITORIO_TABLERO } from './aplicacion/puertos';
import type { RepositorioTablero } from './aplicacion/puertos';
import { RepositorioTableroEnMemoria } from './infraestructura/repositorio-tablero-en-memoria';
import { RepositorioTableroPg } from './infraestructura/repositorio-tablero-pg';
import { TableroController } from './presentacion/tablero.controller';
import { DispositivosController } from './presentacion/dispositivos.controller';
import { OPERACIONES_DE_DISPOSITIVO } from './aplicacion/operaciones-de-dispositivo';
import { OperacionesEnMemoria } from './infraestructura/operaciones-en-memoria';

/**
 * Raíz de composición del tablero.
 *
 * Entra al módulo de eventos **por su barril** (§2.2) y solo para tomar dos
 * puertos ya publicados: el adaptador en memoria del tablero se apoya en los
 * repositorios que ya tienen los datos, en vez de duplicar su estado.
 *
 * H-SITIO-02 · la nota decía «cuando llegue la contraseña de PostgreSQL (D-17)
 * se cambia esta fábrica por `RepositorioTableroPg`». La contraseña llegó en la
 * 09-B y la fábrica no se cambió: en sitio, la pantalla de Dispositivos leía
 * SIEMPRE el doble en memoria —vacío— y un equipo recién dado de alta no
 * aparecía en ninguna parte. Ahora sigue el mismo interruptor que el histórico
 * y el arranque dice cuál quedó activo.
 */
@Module({})
export class TableroModule {
  static registrar(): DynamicModule {
    return {
      module: TableroModule,
      // 15-L · el alcance de equipos (el equipo es de la copropiedad de la ruta).
      imports: [EquiposModule.registrar()],
      controllers: [TableroController, DispositivosController],
      providers: [
        OperacionesEnMemoria,
        { provide: OPERACIONES_DE_DISPOSITIVO, useExisting: OperacionesEnMemoria },
        {
          provide: REPOSITORIO_TABLERO,
          inject: [CONFIGURACION, Pool, BITACORA, REPOSITORIO_EVENTOS, REPOSITORIO_ALERTAS],
          useFactory: (
            configuracion: Configuracion,
            pool: Pool,
            bitacora: Bitacora,
            eventos: RepositorioEventos,
            alertas: RepositorioAlertas,
          ): RepositorioTablero => {
            const enBase = configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres';
            bitacora.registrar(
              enBase ? 'info' : 'aviso',
              `tablero y dispositivos leen de: ${configuracion.PERSISTENCIA_DE_EVENTOS}`,
              {
                persistencia: configuracion.PERSISTENCIA_DE_EVENTOS,
                consecuencia: enBase
                  ? 'la pantalla Dispositivos lista los equipos dados de alta en la base'
                  : 'la pantalla Dispositivos sale VACÍA: los equipos del alta no se ven aquí',
              },
            );
            return enBase
              ? new RepositorioTableroPg(pool)
              : new RepositorioTableroEnMemoria(eventos, alertas);
          },
        },
        {
          provide: ConsultarIndicadores,
          inject: [REPOSITORIO_TABLERO, RELOJ],
          useFactory: (repo: RepositorioTablero, reloj: Reloj) =>
            new ConsultarIndicadores(repo, reloj),
        },
        {
          provide: ConsultarAccesosPorHora,
          inject: [REPOSITORIO_TABLERO, RELOJ],
          useFactory: (repo: RepositorioTablero, reloj: Reloj) =>
            new ConsultarAccesosPorHora(repo, reloj),
        },
        {
          provide: ConsultarDispositivos,
          // E5 (15-M) · la señal de la escucha: el mismo lector que usa la ficha.
          inject: [REPOSITORIO_TABLERO, RELOJ, LECTOR_DE_SENALES],
          useFactory: (repo: RepositorioTablero, reloj: Reloj, senales: LectorDeSenales) =>
            new ConsultarDispositivos(repo, reloj, senales),
        },
      ],
      exports: [REPOSITORIO_TABLERO],
    };
  }
}
