import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ALMACEN_EVIDENCIA, BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type { FuenteDePlacas, ProveedorDeEquipos } from '@ncr/providers';
import { FUENTE_DE_PLACAS, PROVEEDOR_DE_EQUIPOS } from '../proveedores';
import { BiometriaModule, IDENTIDAD_BIOMETRICA } from '../biometria';
import type { IdentidadBiometricaDesdeRepositorios } from '../biometria';
import { ACCIONADOR_DE_PUERTA } from '../guardia';
import type { AccionadorDePuerta } from '../guardia';
import { RegistrarAcceso } from '../eventos';
import { AlarmServerController } from './presentacion/alarm-server.controller';
import { GuardiaDeAlarmServer, EQUIPOS_DE_ALARM_SERVER } from './presentacion/guardia-alarm-server';
import { leerEquiposDeclarados } from '../comun/equipos-de-alarm-server';
import type { EquipoDeclarado } from '../comun/equipos-de-alarm-server';
import { INGESTOR_DE_EQUIPOS, IngestorDeEquipos } from './aplicacion/ingestor-de-publicaciones';
import { CANAL_TIEMPO_REAL } from '../eventos';
import type { CanalTiempoReal } from '../eventos';
import { LOCALIZADOR_DE_VIVIENDA, PadronModule } from '../padron';
import type { LocalizadorDeVivienda } from '../padron';
import { EQUIPOS_QUE_EMITEN, EquiposModule } from '../equipos';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { AVISADOR_DE_LLAMADAS, RESOLUTOR_DE_VIVIENDA_DE_LLAMADA } from './aplicacion/puertos';
import type {
  AvisadorDeLlamadas,
  EquiposParaEscucha,
  ResolutorDeViviendaDeLlamada,
} from './aplicacion/puertos';
import { AvisadorPorCanal } from './infraestructura/avisador-por-canal';
import { EscuchasDeEquipos } from './aplicacion/escuchas-de-equipos';

/**
 * El receptor del «servidor de alarma», y la fuente por la que entran las
 * placas.
 *
 * No trae casos de uso propios: reutiliza `RegistrarAcceso` de `eventos` —que
 * es `@Global` y lo exporta— y el accionador de `guardia`. Si algún día
 * necesitara uno, sería la señal de que la decisión se está duplicando fuera
 * del motor de reglas.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA SOLA FUENTE Y UN SOLO INGESTOR · 15-C, corregido en la 15-E (A1)
 *
 * La 15-C prometía «una sola fuente» y construía la suya aquí, distinta de la
 * que el adaptador real creaba por dentro y que `PLATE_EVENT_SOURCE` exponía.
 * Dos fuentes, un ingestor: lo publicado por el receptor no lo veía ningún
 * suscriptor del puerto, y lo publicado por el transporte de armado no llegaba
 * al ingestor. Ahora la fuente la construye `ProveedoresModule` —la misma que
 * recibe el adaptador— y este módulo sólo le FIJA su único ingestor. Dos
 * ingestores producirían dos eventos por lectura en una tabla append-only, y
 * la propia fuente se niega a aceptar un segundo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EL ACCIONADOR SE RESUELVE POR `ModuleRef` Y NO SE IMPORTA
 *
 * `GuardiaModule` se registra con `GuardiaModule.registrar()`, es decir, como
 * módulo DINÁMICO. Importarlo desde aquí volvería a invocar su fábrica y
 * crearía una SEGUNDA instancia del accionador: la consola de portería
 * accionaría un objeto y la cámara otro, con su propio control real a `null`,
 * y las pruebas seguirían en verde porque cada una mira el suyo. Es el mismo
 * defecto que ya evitó `PlanificacionModule`, y la misma solución: `strict:
 * false` busca la instancia ÚNICA que `app.module.ts` ya registró.
 *
 * La frontera de §2.2 se respeta igual: el token se importa por el BARRIL de
 * `guardia`, no por una ruta interna suya.
 */
@Module({})
export class AlarmServerModule {
  static registrar(equiposCrudos: string | undefined): DynamicModule {
    // Se leen AL CONSTRUIR el módulo: una declaración mal formada rompe el
    // arranque (§2.7.1). Un extremo que acredita equipos no puede descubrir en
    // la primera petición que su configuración no valía.
    const equipos = leerEquiposDeclarados(equiposCrudos);
    return {
      module: AlarmServerModule,
      // A2 · la identidad biométrica, por el barril (misma instancia: ver `eventos`).
      imports: [BiometriaModule.registrar(), PadronModule.registrar(), EquiposModule.registrar()],
      controllers: [AlarmServerController],
      providers: [
        GuardiaDeAlarmServer,
        { provide: EQUIPOS_DE_ALARM_SERVER, useValue: equipos },
        {
          // A4 · el aviso de llamada va por el canal de tiempo real (SSE).
          provide: AVISADOR_DE_LLAMADAS,
          inject: [CANAL_TIEMPO_REAL, BITACORA],
          useFactory: (canal: CanalTiempoReal, bitacora: Bitacora) =>
            new AvisadorPorCanal(canal, bitacora),
        },
        {
          // A4 · la vivienda de la llamada la localiza el padrón, por forma.
          provide: RESOLUTOR_DE_VIVIENDA_DE_LLAMADA,
          inject: [LOCALIZADOR_DE_VIVIENDA],
          useFactory: (localizador: LocalizadorDeVivienda): ResolutorDeViviendaDeLlamada =>
            localizador,
        },
        {
          // A4 · las escuchas de terminal y videoportero viven con el proceso.
          provide: EscuchasDeEquipos,
          inject: [EQUIPOS_QUE_EMITEN, PROVEEDOR_DE_EQUIPOS, BITACORA, CONFIGURACION],
          useFactory: (
            catalogo: EquiposParaEscucha,
            proveedor: ProveedorDeEquipos,
            bitacora: Bitacora,
            c: Configuracion,
          ) =>
            new EscuchasDeEquipos(catalogo, proveedor, bitacora, {
              habilitadas: c.PROVEEDOR_DE_EQUIPOS !== 'simulado',
            }),
        },
        {
          /**
           * El ingestor se construye y se FIJA en la fuente compartida en la
           * misma fábrica: es un efecto deliberado del arranque, y es lo que
           * garantiza que exista un solo camino de una publicación a
           * `RegistrarAcceso`. La fuente rechaza un segundo ingestor.
           */
          provide: INGESTOR_DE_EQUIPOS,
          inject: [
            ModuleRef,
            RegistrarAcceso,
            ALMACEN_EVIDENCIA,
            BITACORA,
            GENERADOR_DE_ID,
            EQUIPOS_DE_ALARM_SERVER,
            FUENTE_DE_PLACAS,
            IDENTIDAD_BIOMETRICA,
            PROVEEDOR_DE_EQUIPOS,
            RELOJ,
            RESOLUTOR_DE_VIVIENDA_DE_LLAMADA,
            AVISADOR_DE_LLAMADAS,
          ],
          useFactory: (
            referencia: ModuleRef,
            registrar: RegistrarAcceso,
            evidencia: AlmacenEvidencia,
            bitacora: Bitacora,
            ids: GeneradorDeId,
            declarados: readonly EquipoDeclarado[],
            fuente: FuenteDePlacas,
            identidad: IdentidadBiometricaDesdeRepositorios,
            proveedor: ProveedorDeEquipos,
            reloj: Reloj,
            viviendas: ResolutorDeViviendaDeLlamada,
            avisador: AvisadorDeLlamadas,
          ) => {
            const ingestor = new IngestorDeEquipos(
              registrar,
              /**
               * Token PROPIO no hace falta aquí: el accionador se resuelve
               * por `ModuleRef` con `strict: false`, que busca la instancia
               * ÚNICA que `app.module.ts` registró. Ver la nota de arriba.
               */
              referencia.get<AccionadorDePuerta>(ACCIONADOR_DE_PUERTA, { strict: false }),
              evidencia,
              bitacora,
              ids,
              declarados,
              // A2 · la terminal reconoce plantillas; biometría sabe de quién son.
              identidad,
              // A2 · el veredicto vuelve por el MISMO proveedor que abre puertas.
              proveedor,
              reloj,
              // A4 · la llamada del videoportero: vivienda por el padrón, aviso por SSE.
              viviendas,
              avisador,
            );
            fuente.fijarIngestor(ingestor);
            return ingestor;
          },
        },
      ],
      exports: [INGESTOR_DE_EQUIPOS, EscuchasDeEquipos],
    };
  }
}
