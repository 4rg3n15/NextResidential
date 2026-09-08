import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { FACE_TEMPLATE_PROVIDER, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { FaceTemplateProvider, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import {
  BOVEDA_DE_PLANTILLAS,
  REPOSITORIO_CONSENTIMIENTOS,
  REPOSITORIO_PLANTILLAS,
} from './aplicacion/puertos';
import type {
  BovedaDePlantillas,
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from './aplicacion/puertos';
import {
  BarrerPlantillasVencidas,
  CapturarRostro,
  ResponderConsentimiento,
  RevocarConsentimiento,
  SincronizarPlantilla,
} from './aplicacion/casos-de-uso';
import { AlmacenEnMemoria, BovedaAesGcm } from './infraestructura/boveda-cifrada';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from './infraestructura/repositorios-en-memoria';
import { MockProvider } from '@ncr/providers';
import { BiometriaController } from './presentacion/biometria.controller';

/**
 * Raíz de composición del módulo de biometría.
 *
 * La bóveda se construye con la llave del entorno y **guarda solo su
 * referencia**: la llave no se persiste, no se registra y no sale de este
 * proceso. La configuración ya falló al arrancar si no estaba (§2.7.1), así que
 * aquí no hay ninguna rama «si no hay llave, no ciframos» — esa rama es
 * exactamente cómo un sistema acaba con datos biométricos en claro.
 *
 * Los repositorios son los dobles en memoria por D-17, como en eventos y zonas.
 * Lo que NO es provisional es la garantía: vive en los disparadores y el CHECK
 * de las migraciones 0008, 0013, 0016 y 0022, y se prueba contra PostgreSQL
 * real en `50_consentimiento_biometrico.sql`.
 */
@Module({})
export class BiometriaModule {
  static registrar(): DynamicModule {
    return {
      module: BiometriaModule,
      controllers: [BiometriaController],
      providers: [
        {
          provide: REPOSITORIO_CONSENTIMIENTOS,
          useFactory: () => new RepositorioConsentimientosEnMemoria(),
        },
        {
          provide: RepositorioConsentimientosEnMemoria,
          useExisting: REPOSITORIO_CONSENTIMIENTOS,
        },
        { provide: REPOSITORIO_PLANTILLAS, useFactory: () => new RepositorioPlantillasEnMemoria() },
        { provide: RepositorioPlantillasEnMemoria, useExisting: REPOSITORIO_PLANTILLAS },
        {
          /**
           * ADR-03 · el hardware va al final, y eso es una prueba. Todo el
           * ciclo biométrico —captura, consentimiento, sincronización,
           * supresión— funciona contra `MockProvider`. La ETAPA 15 sustituye
           * esta línea por `HikvisionFaceTemplateProvider` y no toca nada más;
           * si hiciera falta tocar algo más, el desacople habría fallado.
           */
          provide: FACE_TEMPLATE_PROVIDER,
          useFactory: () => new MockProvider({ semilla: 20260908 }),
        },
        // El almacén es un proveedor propio y no un `new` dentro de la fábrica:
        // así hay UNA instancia por proceso —dos serían dos conjuntos de
        // plantillas y una supresión que no suprime la que la terminal tiene— y
        // así la ETAPA 09 puede sustituirlo por el de PostgreSQL sin tocar la
        // bóveda.
        { provide: AlmacenEnMemoria, useFactory: () => new AlmacenEnMemoria() },
        {
          provide: BOVEDA_DE_PLANTILLAS,
          inject: [CONFIGURACION, FACE_TEMPLATE_PROVIDER, AlmacenEnMemoria],
          useFactory: (
            c: Configuracion,
            terminales: FaceTemplateProvider,
            almacen: AlmacenEnMemoria,
          ) => new BovedaAesGcm(c.BIOMETRIA_LLAVE, c.BIOMETRIA_LLAVE_REF, almacen, terminales),
        },
        {
          provide: CapturarRostro,
          inject: [
            REPOSITORIO_CONSENTIMIENTOS,
            REPOSITORIO_PLANTILLAS,
            BOVEDA_DE_PLANTILLAS,
            RELOJ,
            GENERADOR_DE_ID,
          ],
          useFactory: (
            consentimientos: RepositorioConsentimientos,
            plantillas: RepositorioPlantillas,
            boveda: BovedaDePlantillas,
            reloj: Reloj,
            ids: GeneradorDeId,
          ) => new CapturarRostro(consentimientos, plantillas, boveda, reloj, ids),
        },
        {
          provide: ResponderConsentimiento,
          inject: [REPOSITORIO_CONSENTIMIENTOS, REPOSITORIO_PLANTILLAS, RELOJ],
          useFactory: (
            consentimientos: RepositorioConsentimientos,
            plantillas: RepositorioPlantillas,
            reloj: Reloj,
          ) => new ResponderConsentimiento(consentimientos, plantillas, reloj),
        },
        {
          provide: RevocarConsentimiento,
          inject: [
            REPOSITORIO_CONSENTIMIENTOS,
            REPOSITORIO_PLANTILLAS,
            BOVEDA_DE_PLANTILLAS,
            RELOJ,
          ],
          useFactory: (
            consentimientos: RepositorioConsentimientos,
            plantillas: RepositorioPlantillas,
            boveda: BovedaDePlantillas,
            reloj: Reloj,
          ) => new RevocarConsentimiento(consentimientos, plantillas, boveda, reloj),
        },
        {
          provide: SincronizarPlantilla,
          inject: [
            REPOSITORIO_CONSENTIMIENTOS,
            REPOSITORIO_PLANTILLAS,
            BOVEDA_DE_PLANTILLAS,
            RELOJ,
          ],
          useFactory: (
            consentimientos: RepositorioConsentimientos,
            plantillas: RepositorioPlantillas,
            boveda: BovedaDePlantillas,
            reloj: Reloj,
          ) => new SincronizarPlantilla(consentimientos, plantillas, boveda, reloj),
        },
        {
          provide: BarrerPlantillasVencidas,
          inject: [REPOSITORIO_PLANTILLAS, BOVEDA_DE_PLANTILLAS, RELOJ],
          useFactory: (
            plantillas: RepositorioPlantillas,
            boveda: BovedaDePlantillas,
            reloj: Reloj,
          ) => new BarrerPlantillasVencidas(plantillas, boveda, reloj),
        },
      ],
      exports: [
        REPOSITORIO_CONSENTIMIENTOS,
        REPOSITORIO_PLANTILLAS,
        BOVEDA_DE_PLANTILLAS,
        FACE_TEMPLATE_PROVIDER,
        AlmacenEnMemoria,
      ],
    };
  }
}
