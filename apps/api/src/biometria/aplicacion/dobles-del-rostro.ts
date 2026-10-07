import type { FaceTemplateProvider, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AlmacenEnMemoria, BovedaAesGcm } from '../infraestructura/boveda-cifrada';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import { RostrosEnMemoria } from '../infraestructura/rostros-en-memoria';
import { SincronizarPlantilla } from './casos-de-uso';
import { PreparacionDeCaptura } from './preparacion-de-captura';
import { RevocarConsentimiento } from './revocar-consentimiento';
import { RostroDeResidente } from './rostro-de-residente';
import { SincronizarPlantillaEnTerminales } from './sincronizacion-total';
import { SuprimirYRetirarYa } from './suprimir-y-retirar';

/**
 * 15-X · los dobles del rostro de un residente (D2) y de un menor (D3): la
 * biometría entera en memoria —consentimientos, plantillas, bóveda cifrada de
 * verdad y dos terminales espiadas—. Viven en `src/` como los de eventos
 * (`eventos/aplicacion/dobles.ts`): los usan las pruebas de al lado, y uno solo
 * evita que dos pruebas midan montajes distintos creyendo medir el mismo. No
 * se exportan por el módulo: nada de producción los importa.
 */
export const COP = 'cop-1';
export const PERSONA = 'persona-1';
const LLAVE = 'llave-de-prueba-de-treinta-y-dos-caracteres';
export const ctx: ContextoTenant = {
  usuarioId: 'cuenta-1',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};

export class Espia implements FaceTemplateProvider {
  readonly recibidas: string[] = [];
  readonly retiradas: string[] = [];
  async sincronizar(d: string, p: string) {
    this.recibidas.push(`${d}/${p}`);
  }
  async suprimir(d: string, p: string) {
    this.retiradas.push(`${d}/${p}`);
  }
}

export const montar = () => {
  let t = new Date('2026-10-08T12:00:00Z').getTime();
  const reloj: Reloj = { ahora: () => new Date((t += 1000)) };
  let n = 0;
  const ids: GeneradorDeId = { nuevo: () => `id-${String((n += 1))}` };
  const consentimientos = new RepositorioConsentimientosEnMemoria();
  const plantillas = new RepositorioPlantillasEnMemoria();
  const espia = new Espia();
  const boveda = new BovedaAesGcm(LLAVE, 'env:prueba', new AlmacenEnMemoria(), espia);
  const memoria = new RostrosEnMemoria(plantillas, consentimientos);
  const catalogo = {
    conBibliotecaDeRostros: async () => [
      { dispositivoId: 't-1', nombre: 'Terminal' },
      { dispositivoId: 't-2', nombre: 'Videoportero' },
    ],
  };
  const sincronizar = new SincronizarPlantilla(consentimientos, plantillas, boveda, reloj);
  const bitacora = { registrar: () => undefined };
  const rostro = new RostroDeResidente({
    preparacion: new PreparacionDeCaptura(consentimientos, reloj, ids),
    consentimientos,
    reemplazo: memoria,
    boveda,
    lectura: memoria,
    catalogo,
    enTerminales: new SincronizarPlantillaEnTerminales(plantillas, catalogo, sincronizar, bitacora),
    revocar: new RevocarConsentimiento(consentimientos, plantillas, boveda, reloj),
    suprimirYa: new SuprimirYRetirarYa(plantillas, boveda, reloj, bitacora),
    reloj,
  });
  return { rostro, consentimientos, plantillas, espia, memoria };
};

export const entrada = (
  medidas = { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
) => ({
  titularId: PERSONA,
  vector: new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]),
  medidas,
  versionPolitica: 'rostro-v1',
  suprimirEn: new Date('2027-10-08T12:00:00Z'),
});
