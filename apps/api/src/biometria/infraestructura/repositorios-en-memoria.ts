import { esExito } from '@ncr/domain-core';
import type { ConsentimientoBiometrico, PlantillaBiometrica } from '@ncr/domain-core';
import type {
  DestinoDePlantilla,
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from '../aplicacion/puertos';

/**
 * Dobles en memoria. Provisionales por D-17 —sin contraseña de PostgreSQL la
 * API no se conecta en tiempo de ejecución— y **explícitamente incapaces de
 * demostrar lo que importa de esta etapa**: los cerrojos de RN-09 y RN-11 son
 * disparadores y CHECK de la base, y aquí no hay base.
 *
 * Lo que estos dobles sí permiten es probar el ORDEN de los casos de uso —que
 * la calidad se evalúe antes de pedir consentimiento, que la revocación borre
 * antes de guardar— que es responsabilidad de la aplicación y no de la base.
 * La garantía estructural se prueba en `50_consentimiento_biometrico.sql`,
 * contra PostgreSQL real y verificada por mutación.
 */
export class RepositorioConsentimientosEnMemoria implements RepositorioConsentimientos {
  private readonly filas = new Map<string, ConsentimientoBiometrico>();

  private clave(copropiedadId: string, id: string): string {
    return `${copropiedadId}/${id}`;
  }

  declarar(c: ConsentimientoBiometrico): void {
    this.filas.set(this.clave(c.copropiedadId, c.id), c);
  }

  async porId(copropiedadId: string, id: string): Promise<ConsentimientoBiometrico | null> {
    return this.filas.get(this.clave(copropiedadId, id)) ?? null;
  }

  async vigenteDe(
    copropiedadId: string,
    titularId: string,
  ): Promise<ConsentimientoBiometrico | null> {
    for (const c of this.filas.values()) {
      if (c.copropiedadId === copropiedadId && c.titularId === titularId && c.vigente) return c;
    }
    return null;
  }

  async pendientesVencidos(
    copropiedadId: string,
    ahora: Date,
    plazoHoras: number,
  ): Promise<readonly ConsentimientoBiometrico[]> {
    return [...this.filas.values()].filter(
      (c) => c.copropiedadId === copropiedadId && c.venciendo(ahora, plazoHoras),
    );
  }

  async guardar(consentimiento: ConsentimientoBiometrico): Promise<void> {
    this.declarar(consentimiento);
  }
}

export class RepositorioPlantillasEnMemoria implements RepositorioPlantillas {
  private readonly filas = new Map<string, PlantillaBiometrica>();
  /** `plantillaId → dispositivos que la tienen`. Espejo de la tabla real. */
  readonly sincronizaciones = new Map<string, Set<string>>();

  private clave(copropiedadId: string, id: string): string {
    return `${copropiedadId}/${id}`;
  }

  declarar(p: PlantillaBiometrica): void {
    this.filas.set(this.clave(p.copropiedadId, p.id), p);
  }

  async porId(copropiedadId: string, id: string): Promise<PlantillaBiometrica | null> {
    return this.filas.get(this.clave(copropiedadId, id)) ?? null;
  }

  async deConsentimiento(
    copropiedadId: string,
    consentimientoId: string,
  ): Promise<readonly PlantillaBiometrica[]> {
    return [...this.filas.values()].filter(
      (p) => p.copropiedadId === copropiedadId && p.consentimientoId === consentimientoId,
    );
  }

  async vencidas(copropiedadId: string, ahora: Date): Promise<readonly PlantillaBiometrica[]> {
    return [...this.filas.values()].filter(
      (p) => p.copropiedadId === copropiedadId && !p.suprimida && p.venceEn(ahora),
    );
  }

  /**
   * La cola de retirada se DERIVA, igual que en la base: plantillas suprimidas
   * que siguen constando en un equipo. No hay estado «pendiente de retirada»
   * que alguien pueda escribir y olvidar.
   */
  async porRetirar(copropiedadId: string): Promise<readonly DestinoDePlantilla[]> {
    const destinos: DestinoDePlantilla[] = [];
    for (const p of this.filas.values()) {
      if (p.copropiedadId !== copropiedadId || !p.suprimida) continue;
      for (const dispositivoId of this.sincronizaciones.get(p.id) ?? []) {
        destinos.push({ plantillaId: p.id, dispositivoId });
      }
    }
    return destinos;
  }

  async guardar(plantilla: PlantillaBiometrica): Promise<void> {
    this.declarar(plantilla);
  }

  async suprimirVector(): Promise<void> {
    // En memoria el vector vive en la bóveda, que ya lo olvidó. La fila se
    // marca en `guardar`, con el agregado que decidió la supresión.
  }

  async registrarSincronizacion(destino: DestinoDePlantilla): Promise<void> {
    const equipos = this.sincronizaciones.get(destino.plantillaId) ?? new Set<string>();
    equipos.add(destino.dispositivoId);
    this.sincronizaciones.set(destino.plantillaId, equipos);
  }

  async registrarRetirada(destino: DestinoDePlantilla): Promise<void> {
    this.sincronizaciones.get(destino.plantillaId)?.delete(destino.dispositivoId);
  }
}

/** Se reexporta para que las pruebas no dependan de un detalle de `@ncr`. */
export const esResultadoExitoso = esExito;
