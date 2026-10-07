import { COP_A } from '../constantes';
import { VIVIENDA_1, VIVIENDA_2 } from './directorio-del-residente';
import type {
  MenorParaElRostro,
  MenoresParaElRostro,
} from '../../src/residente/aplicacion/rostro-de-mis-menores';

/**
 * 15-X · D3 · un menor de 16 años en cada una de las DOS viviendas del doble
 * del directorio, para que el barrido de aislamiento SIN base nombre el menor
 * del vecino y espere 404. Como el adaptador de PostgreSQL, sólo responde por
 * (copropiedad, vivienda del ámbito, residente): lo ajeno no existe.
 */
export const MENOR_V1 = '90000000-0000-4000-8000-000000000001';
export const MENOR_V2 = '90000000-0000-4000-8000-000000000002';

const nacidoHace16 = (): string => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 16);
  d.setUTCDate(d.getUTCDate() - 60);
  return d.toISOString().slice(0, 10);
};

const MENORES: ReadonlyMap<string, { readonly vivienda: string; readonly personaId: string }> =
  new Map([
    [MENOR_V1, { vivienda: VIVIENDA_1, personaId: '91000000-0000-4000-8000-000000000001' }],
    [MENOR_V2, { vivienda: VIVIENDA_2, personaId: '91000000-0000-4000-8000-000000000002' }],
  ]);

export class MenoresParaElRostroEnMemoria implements MenoresParaElRostro {
  async delHogar(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
  ): Promise<MenorParaElRostro | null> {
    const m = MENORES.get(residenteId);
    if (copropiedadId !== COP_A || m === undefined || m.vivienda !== viviendaId) return null;
    return { personaId: m.personaId, fechaNacimiento: nacidoHace16() };
  }
}
