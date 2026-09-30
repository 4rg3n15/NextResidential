import type { Reloj } from '@ncr/domain-core';
import { VIGENCIA_EN_COLA_POR_OMISION_S, construirCola, resumenDeCola } from './cola-de-atencion';
import type { EnAtencion, MaterialDeLaCola } from './cola-de-atencion';
import { mezclarPreferencias } from './preferencias-de-atencion';
import type {
  PreferenciasDeAtencion,
  RepositorioDePreferenciasDeAtencion,
} from './preferencias-de-atencion';

/**
 * G1 (15-N) · LA COLA DE ATENCIÓN, COMO CASO DE USO
 *
 * Hasta la 15-N la armaba el controlador con un filtro de «la última hora, 50
 * filas» sobre `eventos`: lógica de aplicación en la presentación, y la razón
 * de que los permitidos entraran. Aquí: la fuente trae lo que llegó dentro de
 * la vigencia (más un margen por relojes de equipo adelantados), la función
 * pura decide qué entra y en qué orden, y con ella viajan las preferencias de
 * la copropiedad (G2), que la consola necesita para abrir y sonar.
 */
export interface FuenteDeLaCola {
  material(copropiedadId: string, desde: Date, hasta: Date): Promise<MaterialDeLaCola>;
}
export const FUENTE_DE_LA_COLA = Symbol.for('ncr.guardia.FuenteDeLaCola');

/** Un equipo con el reloj adelantado fecha en el futuro: se admite este margen. */
export const MARGEN_DE_RELOJ_MS = 5 * 60_000;

export interface ColaConsultada {
  readonly cola: readonly EnAtencion[];
  readonly total: number;
  readonly criticos: number;
  readonly esperaMaxima: number;
  readonly vigenciaSegundos: number;
  readonly preferencias: PreferenciasDeAtencion;
}

export class ConsultarColaDeAtencion {
  constructor(
    private readonly fuente: FuenteDeLaCola,
    private readonly preferencias: RepositorioDePreferenciasDeAtencion,
    private readonly reloj: Reloj,
    private readonly vigenciaSegundos: number = VIGENCIA_EN_COLA_POR_OMISION_S,
  ) {}

  async ejecutar(copropiedadId: string): Promise<ColaConsultada> {
    const ahora = this.reloj.ahora();
    const desde = new Date(ahora.getTime() - this.vigenciaSegundos * 1000 - MARGEN_DE_RELOJ_MS);
    const hasta = new Date(ahora.getTime() + MARGEN_DE_RELOJ_MS);
    const [material, guardadas] = await Promise.all([
      this.fuente.material(copropiedadId, desde, hasta),
      this.preferencias.leer(copropiedadId),
    ]);
    const cola = construirCola(material, ahora, { vigenciaSegundos: this.vigenciaSegundos });
    return {
      cola,
      ...resumenDeCola(cola),
      vigenciaSegundos: this.vigenciaSegundos,
      preferencias: mezclarPreferencias(guardadas),
    };
  }
}
