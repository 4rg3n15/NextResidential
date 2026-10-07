import type { Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import {
  BOVEDA_DE_PLANTILLAS,
  CATALOGO_DE_TERMINALES,
  REPOSITORIO_CONSENTIMIENTOS,
  REPOSITORIO_PLANTILLAS,
} from './aplicacion/puertos';
import type {
  BovedaDePlantillas,
  CatalogoDeTerminales,
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from './aplicacion/puertos';
import { LECTURA_DE_ROSTROS, REEMPLAZO_DE_ROSTRO } from './aplicacion/puertos-del-rostro';
import type { LecturaDeRostros, ReemplazoDeRostro } from './aplicacion/puertos-del-rostro';
import { RevocarConsentimiento } from './aplicacion/casos-de-uso';
import { PreparacionDeCaptura } from './aplicacion/preparacion-de-captura';
import { RostroDeResidente } from './aplicacion/rostro-de-residente';
import { SincronizarPlantillaEnTerminales } from './aplicacion/sincronizacion-total';
import { SuprimirYRetirarYa } from './aplicacion/suprimir-y-retirar';
import { ReemplazoDeRostroPg } from './infraestructura/reemplazo-de-rostro-pg';
import { LecturaDeRostrosPg } from './infraestructura/rostros-de-residente-pg';
import { RostrosEnMemoria } from './infraestructura/rostros-en-memoria';
import type {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from './infraestructura/repositorios-en-memoria';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA SUPRESIÓN Y EL ROSTRO DEL RESIDENTE · raíz de composición aparte (15-X)
 *
 * `biometria.module.ts` ya pasaba de 300 líneas: lo nuevo de la 15-X entra
 * aquí, y con ello salen de allí la revocación y la supresión por titular, que
 * son de la misma familia. Con `PERSISTENCIA_DE_BIOMETRIA=memoria` la lectura
 * y el reemplazo del rostro van sobre el doble de plantillas, como el resto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const ROSTROS_EN_MEMORIA = Symbol('ROSTROS_EN_MEMORIA');

export const PROVEEDORES_DEL_ROSTRO: Provider[] = [
  {
    provide: RevocarConsentimiento,
    inject: [REPOSITORIO_CONSENTIMIENTOS, REPOSITORIO_PLANTILLAS, BOVEDA_DE_PLANTILLAS, RELOJ],
    useFactory: (
      consentimientos: RepositorioConsentimientos,
      plantillas: RepositorioPlantillas,
      boveda: BovedaDePlantillas,
      reloj: Reloj,
    ) => new RevocarConsentimiento(consentimientos, plantillas, boveda, reloj),
  },
  {
    // C9 (15-M) · la baja de un residente suprime sus plantillas (RN-11); desde
    // la 15-X, además, las saca de los equipos en el acto.
    provide: SuprimirYRetirarYa,
    inject: [REPOSITORIO_PLANTILLAS, BOVEDA_DE_PLANTILLAS, RELOJ, BITACORA],
    useFactory: (
      plantillas: RepositorioPlantillas,
      boveda: BovedaDePlantillas,
      reloj: Reloj,
      bitacora: Bitacora,
    ) => new SuprimirYRetirarYa(plantillas, boveda, reloj, bitacora),
  },
  {
    provide: ROSTROS_EN_MEMORIA,
    inject: [CONFIGURACION, REPOSITORIO_PLANTILLAS, REPOSITORIO_CONSENTIMIENTOS],
    useFactory: (
      c: Configuracion,
      plantillas: RepositorioPlantillas,
      consentimientos: RepositorioConsentimientos,
    ) =>
      c.PERSISTENCIA_DE_BIOMETRIA === 'postgres'
        ? null
        : new RostrosEnMemoria(
            plantillas as RepositorioPlantillasEnMemoria,
            consentimientos as RepositorioConsentimientosEnMemoria,
          ),
  },
  {
    provide: LECTURA_DE_ROSTROS,
    inject: [ROSTROS_EN_MEMORIA, Pool],
    useFactory: (memoria: RostrosEnMemoria | null, pool: Pool): LecturaDeRostros =>
      memoria ?? new LecturaDeRostrosPg(pool),
  },
  {
    provide: REEMPLAZO_DE_ROSTRO,
    inject: [ROSTROS_EN_MEMORIA, Pool],
    useFactory: (memoria: RostrosEnMemoria | null, pool: Pool): ReemplazoDeRostro =>
      memoria ?? new ReemplazoDeRostroPg(pool),
  },
  {
    provide: RostroDeResidente,
    inject: [
      REPOSITORIO_CONSENTIMIENTOS,
      RELOJ,
      GENERADOR_DE_ID,
      REEMPLAZO_DE_ROSTRO,
      BOVEDA_DE_PLANTILLAS,
      LECTURA_DE_ROSTROS,
      CATALOGO_DE_TERMINALES,
      SincronizarPlantillaEnTerminales,
      RevocarConsentimiento,
      SuprimirYRetirarYa,
    ],
    useFactory: (
      consentimientos: RepositorioConsentimientos,
      reloj: Reloj,
      ids: GeneradorDeId,
      reemplazo: ReemplazoDeRostro,
      boveda: BovedaDePlantillas,
      lectura: LecturaDeRostros,
      catalogo: CatalogoDeTerminales,
      enTerminales: SincronizarPlantillaEnTerminales,
      revocar: RevocarConsentimiento,
      suprimirYa: SuprimirYRetirarYa,
    ) =>
      new RostroDeResidente({
        preparacion: new PreparacionDeCaptura(consentimientos, reloj, ids),
        consentimientos,
        reemplazo,
        boveda,
        lectura,
        catalogo,
        enTerminales,
        revocar,
        suprimirYa,
        reloj,
      }),
  },
];
