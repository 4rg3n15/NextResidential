import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, FACE_TEMPLATE_PROVIDER, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, FaceTemplateProvider, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { EquiposModule, TERMINALES_DE_ROSTROS } from '../equipos';
import {
  BOVEDA_DE_PLANTILLAS,
  CATALOGO_DE_TERMINALES,
  FIRMANTE_DE_ENLACES,
  IDENTIDAD_BIOMETRICA,
  REPOSITORIO_CONSENTIMIENTOS,
  REPOSITORIO_PLANTILLAS,
} from './aplicacion/puertos';
import { IdentidadBiometricaDesdeRepositorios } from './aplicacion/identidad-biometrica';
import type {
  BovedaDePlantillas,
  CatalogoDeTerminales,
  FirmanteDeEnlaces,
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
import {
  EmitirEnlaceDeConsentimiento,
  ResolverEnlaceDeConsentimiento,
} from './aplicacion/enlace-de-consentimiento';
import {
  PropagarConsentimientoAceptado,
  SincronizarPlantillaEnTerminales,
} from './aplicacion/sincronizacion-total';
import { AlmacenEnMemoria, BovedaAesGcm } from './infraestructura/boveda-cifrada';
import type { AlmacenDeBytes } from './infraestructura/boveda-cifrada';
import { FirmanteHmacDeEnlaces } from './infraestructura/firmante-de-enlaces';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from './infraestructura/repositorios-en-memoria';
import {
  AlmacenDeBytesPg,
  RepositorioConsentimientosPg,
  RepositorioPlantillasPg,
} from './infraestructura/repositorios-pg';
import { BiometriaController } from './presentacion/biometria.controller';
import { ConsentimientoPublicoController } from './presentacion/consentimiento-publico.controller';

/** Dónde vive el sobre cifrado: en memoria (suite) o en la fila de la plantilla. */
export const ALMACEN_DE_PLANTILLAS = Symbol.for('ncr.biometria.AlmacenDePlantillas');

/**
 * Raíz de composición del módulo de biometría.
 *
 * La bóveda se construye con la llave del entorno y **guarda solo su
 * referencia**: la llave no se persiste, no se registra y no sale de este
 * proceso. La configuración ya falló al arrancar si no estaba (§2.7.1), así que
 * aquí no hay ninguna rama «si no hay llave, no ciframos» — esa rama es
 * exactamente cómo un sistema acaba con datos biométricos en claro.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * A3 (ETAPA 15-E) · LA BASE ENTRA EN EL CAMINO
 *
 * Hasta aquí los repositorios eran los dobles en memoria (D-17) en tiempo de
 * ejecución, y los cerrojos de RN-09 y RN-11 —construidos en la ETAPA 08 y
 * probados contra PostgreSQL— no actuaban sobre nada. `PERSISTENCIA_DE_BIOMETRIA`
 * decide, igual que el histórico de eventos: `postgres` por omisión y
 * `memoria` para la suite, que lo declara. Un proceso en `memoria` lo avisa
 * al arrancar, porque en ese modo la supresión «de inmediato» de CA-11 es una
 * frase y no una fila.
 */
@Module({})
export class BiometriaModule {
  static registrar(): DynamicModule {
    return {
      module: BiometriaModule,
      imports: [EquiposModule.registrar()],
      controllers: [BiometriaController, ConsentimientoPublicoController],
      providers: [
        {
          provide: REPOSITORIO_CONSENTIMIENTOS,
          inject: [CONFIGURACION, Pool, BITACORA],
          useFactory: (c: Configuracion, pool: Pool, bitacora: Bitacora) => {
            const enBase = c.PERSISTENCIA_DE_BIOMETRIA === 'postgres';
            bitacora.registrar(
              enBase ? 'info' : 'aviso',
              `biometría activa: ${c.PERSISTENCIA_DE_BIOMETRIA}`,
              {
                persistencia: c.PERSISTENCIA_DE_BIOMETRIA,
                consecuencia: enBase
                  ? 'consentimientos y plantillas en la base, con sus cerrojos (RN-09, RN-11)'
                  : 'consentimientos y plantillas viven en este proceso y se PIERDEN al reiniciar',
              },
            );
            return enBase
              ? new RepositorioConsentimientosPg(pool)
              : new RepositorioConsentimientosEnMemoria();
          },
        },
        {
          provide: REPOSITORIO_PLANTILLAS,
          inject: [CONFIGURACION, Pool],
          useFactory: (c: Configuracion, pool: Pool) =>
            c.PERSISTENCIA_DE_BIOMETRIA === 'postgres'
              ? new RepositorioPlantillasPg(pool)
              : new RepositorioPlantillasEnMemoria(),
        },
        {
          // A2 · lo que otros módulos preguntan de una plantilla, servido por
          // los mismos repositorios: una sola verdad sobre quién es quién.
          provide: IDENTIDAD_BIOMETRICA,
          inject: [REPOSITORIO_PLANTILLAS, REPOSITORIO_CONSENTIMIENTOS],
          useFactory: (
            plantillas: RepositorioPlantillas,
            consentimientos: RepositorioConsentimientos,
          ) => new IdentidadBiometricaDesdeRepositorios(plantillas, consentimientos),
        },
        /**
         * El almacén es un proveedor propio y no un `new` dentro de la fábrica:
         * así hay UNA instancia por proceso —dos serían dos conjuntos de
         * plantillas y una supresión que no suprime la que la terminal tiene—.
         * En `postgres` el sobre va en la fila de la plantilla (D-10).
         */
        {
          provide: ALMACEN_DE_PLANTILLAS,
          inject: [CONFIGURACION, Pool],
          useFactory: (c: Configuracion, pool: Pool): AlmacenDeBytes =>
            c.PERSISTENCIA_DE_BIOMETRIA === 'postgres'
              ? new AlmacenDeBytesPg(pool)
              : new AlmacenEnMemoria(),
        },
        // La suite mira el almacén por su clase; en `memoria` es el mismo objeto.
        { provide: AlmacenEnMemoria, useExisting: ALMACEN_DE_PLANTILLAS },
        /**
         * ═════════════════════════════════════════════════════════════════════
         * AQUÍ HABÍA UN `new MockProvider`, Y ERA EL AGUJERO DE ADR-03
         *
         * Este módulo construía su propio proveedor de plantillas. El ADR dice
         * que cambiar de adaptador no debe tocar nada más, y con esa línea
         * «cambiar de adaptador» significaba **editar este fichero**: la
         * verificación que el ADR promete no se podía hacer.
         *
         * Desde la 15-C, `FACE_TEMPLATE_PROVIDER` lo sirve `ProveedoresModule`,
         * que es global y es el único sitio del proyecto que decide entre el
         * simulado y el real. Aquí sólo se inyecta.
         */
        {
          provide: BOVEDA_DE_PLANTILLAS,
          inject: [CONFIGURACION, FACE_TEMPLATE_PROVIDER, ALMACEN_DE_PLANTILLAS],
          useFactory: (
            c: Configuracion,
            terminales: FaceTemplateProvider,
            almacen: AlmacenDeBytes,
          ) => new BovedaAesGcm(c.BIOMETRIA_LLAVE, c.BIOMETRIA_LLAVE_REF, almacen, terminales),
        },
        {
          // A3 · la misma llave maestra de biometría, derivada por copropiedad
          // y por propósito (HKDF): un enlace no comparte llave con un vector.
          provide: FIRMANTE_DE_ENLACES,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) => new FirmanteHmacDeEnlaces(c.BIOMETRIA_LLAVE),
        },
        {
          // A3 · el catálogo lo satisface equipos por forma (§2.2).
          provide: CATALOGO_DE_TERMINALES,
          inject: [TERMINALES_DE_ROSTROS],
          useFactory: (catalogo: CatalogoDeTerminales) => catalogo,
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
          provide: SincronizarPlantillaEnTerminales,
          inject: [REPOSITORIO_PLANTILLAS, CATALOGO_DE_TERMINALES, SincronizarPlantilla, BITACORA],
          useFactory: (
            plantillas: RepositorioPlantillas,
            catalogo: CatalogoDeTerminales,
            sincronizar: SincronizarPlantilla,
            bitacora: Bitacora,
          ) => new SincronizarPlantillaEnTerminales(plantillas, catalogo, sincronizar, bitacora),
        },
        {
          provide: PropagarConsentimientoAceptado,
          inject: [REPOSITORIO_PLANTILLAS, SincronizarPlantillaEnTerminales, BITACORA],
          useFactory: (
            plantillas: RepositorioPlantillas,
            enTerminales: SincronizarPlantillaEnTerminales,
            bitacora: Bitacora,
          ) => new PropagarConsentimientoAceptado(plantillas, enTerminales, bitacora),
        },
        {
          provide: EmitirEnlaceDeConsentimiento,
          inject: [REPOSITORIO_CONSENTIMIENTOS, FIRMANTE_DE_ENLACES, RELOJ, CONFIGURACION],
          useFactory: (
            consentimientos: RepositorioConsentimientos,
            firmante: FirmanteDeEnlaces,
            reloj: Reloj,
            c: Configuracion,
          ) =>
            new EmitirEnlaceDeConsentimiento(consentimientos, firmante, reloj, {
              plazoHoras: c.BIOMETRIA_PLAZO_CONSENTIMIENTO_HORAS,
              urlPublica: c.API_URL_PUBLICA ?? null,
            }),
        },
        {
          provide: ResolverEnlaceDeConsentimiento,
          inject: [REPOSITORIO_CONSENTIMIENTOS, FIRMANTE_DE_ENLACES, RELOJ],
          useFactory: (
            consentimientos: RepositorioConsentimientos,
            firmante: FirmanteDeEnlaces,
            reloj: Reloj,
          ) => new ResolverEnlaceDeConsentimiento(consentimientos, firmante, reloj),
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
        // Lo consume el módulo del residente para su propia ruta de captura.
        CapturarRostro,
        // A3 · y el enlace con el que su visitante responde.
        EmitirEnlaceDeConsentimiento,
        // A2 · lo consumen el receptor de equipos y el cargador del motor.
        IDENTIDAD_BIOMETRICA,
        // ETAPA 14 · lo consume el planificador (D-40): RN-11 da 24 h para
        // suprimir, y hasta ahora el barrido solo salía por su ruta HTTP.
        BarrerPlantillasVencidas,
        REPOSITORIO_CONSENTIMIENTOS,
        REPOSITORIO_PLANTILLAS,
        BOVEDA_DE_PLANTILLAS,
        AlmacenEnMemoria,
      ],
    };
  }
}
