import { Injectable } from '@nestjs/common';
import { FiltroDeEventos, UMBRAL_DE_LATIDO_POR_DEFECTO, horaLocal } from '@ncr/domain-core';
import type { VentanaDelDia } from '@ncr/domain-core';
import type { RepositorioAlertas, RepositorioEventos } from '../../eventos';
import type {
  ConfiguracionDeTablero,
  ConteosDeAlertas,
  ConteosDelPadron,
  ConteosDeVisitantes,
  DispositivoDelTablero,
  FranjaDeAccesos,
  RepositorioTablero,
  SeveridadDeAlerta,
} from '../aplicacion/puertos';

/** Orden de gravedad, declarado y no deducido del orden del enumerado. */
const GRAVEDAD: readonly SeveridadDeAlerta[] = ['critica', 'alta', 'media', 'informativa'];

/**
 * Adaptador en memoria del tablero — **provisional y declarado como tal**, igual
 * que los del módulo de eventos: este entorno no tiene contraseña de PostgreSQL
 * (D-17), así que la API arranca con él y `RepositorioTableroPg` es el que
 * cumple el mismo puerto contra la base.
 *
 * No inventa datos. Las alertas y el histograma salen de los repositorios en
 * memoria que ya existen —entra por su barril, no por dentro (§2.2)—, así que
 * lo que la consola pinta es lo que realmente se ingirió. Los conteos del
 * padrón se quedan en cero porque no hay adaptador en memoria del padrón: es
 * una carencia visible en pantalla, que es mejor que un número inventado que
 * parece cierto.
 */
@Injectable()
export class RepositorioTableroEnMemoria implements RepositorioTablero {
  private readonly padron = new Map<string, ConteosDelPadron>();
  private readonly visitantes = new Map<string, ConteosDeVisitantes>();
  private readonly equipos = new Map<string, DispositivoDelTablero[]>();
  private readonly zonas = new Map<string, string>();

  constructor(
    private readonly eventos: RepositorioEventos,
    private readonly alertas: RepositorioAlertas,
  ) {}

  async configuracion(copropiedadId: string): Promise<ConfiguracionDeTablero> {
    return {
      copropiedadId,
      zonaHoraria: this.zonas.get(copropiedadId) ?? 'America/Bogota',
      umbralDeLatido: UMBRAL_DE_LATIDO_POR_DEFECTO,
    };
  }

  async conteosDelPadron(copropiedadId: string): Promise<ConteosDelPadron> {
    return (
      this.padron.get(copropiedadId) ?? {
        residentesActivos: 0,
        residentesAltaEnVentana: 0,
        vehiculosActivos: 0,
        vehiculosAltaEnVentana: 0,
      }
    );
  }

  async conteosDeVisitantes(copropiedadId: string): Promise<ConteosDeVisitantes> {
    return this.visitantes.get(copropiedadId) ?? { autorizacionesDelDia: 0, dentroAhora: 0 };
  }

  async conteosDeAlertas(copropiedadId: string): Promise<ConteosDeAlertas> {
    const abiertas = await this.alertas.abiertasDe(copropiedadId);
    const severidades = new Set(abiertas.map((a) => a.severidad as SeveridadDeAlerta));
    return {
      pendientes: abiertas.length,
      severidadMaxima: GRAVEDAD.find((s) => severidades.has(s)) ?? null,
    };
  }

  async accesosPorHora(
    copropiedadId: string,
    ventana: VentanaDelDia,
  ): Promise<readonly FranjaDeAccesos[]> {
    const filtro = FiltroDeEventos.crear({
      copropiedadId,
      desde: ventana.desde,
      hasta: ventana.hasta,
      viviendaId: null,
      personaId: null,
      dispositivoId: null,
      zonaId: null,
      tipo: null,
      resultado: null,
      motivo: null,
      tamanoPagina: 200,
      cursor: null,
    });
    if (!filtro.ok) return [];

    const acumulado = new Map<number, { permitidos: number; negados: number }>();
    let cursor: string | null = null;
    do {
      const pagina = await this.eventos.consultar(
        cursor === null ? filtro.valor : conCursor(filtro.valor, cursor),
      );
      for (const fila of pagina.filas) {
        const hora = horaLocal(fila.ocurridoEn, ventana.zonaHoraria);
        const franja = acumulado.get(hora) ?? { permitidos: 0, negados: 0 };
        if (fila.resultado === 'permitido') franja.permitidos += 1;
        else franja.negados += 1;
        acumulado.set(hora, franja);
      }
      cursor = pagina.siguiente;
    } while (cursor !== null);

    return [...acumulado.entries()]
      .map(([hora, v]) => ({ hora, ...v }))
      .sort((a, b) => a.hora - b.hora);
  }

  async dispositivos(copropiedadId: string): Promise<readonly DispositivoDelTablero[]> {
    return this.equipos.get(copropiedadId) ?? [];
  }

  // ---- Alimentación para pruebas. No es parte del puerto. -------------------

  declararZonaHoraria(copropiedadId: string, zonaHoraria: string): void {
    this.zonas.set(copropiedadId, zonaHoraria);
  }

  declararPadron(copropiedadId: string, conteos: ConteosDelPadron): void {
    this.padron.set(copropiedadId, conteos);
  }

  declararVisitantes(copropiedadId: string, conteos: ConteosDeVisitantes): void {
    this.visitantes.set(copropiedadId, conteos);
  }

  declararDispositivo(copropiedadId: string, dispositivo: DispositivoDelTablero): void {
    const lista = this.equipos.get(copropiedadId) ?? [];
    lista.push(dispositivo);
    this.equipos.set(copropiedadId, lista);
  }
}

/**
 * El filtro es inmutable, así que avanzar de página exige reconstruirlo. Si la
 * reconstrucción fallara sería porque el cursor está corrupto, y seguir sería
 * peor que parar — mismo criterio que `ExportarEventos`.
 */
const conCursor = (filtro: FiltroDeEventos, cursor: string): FiltroDeEventos => {
  const nuevo = FiltroDeEventos.crear({
    copropiedadId: filtro.copropiedadId,
    desde: filtro.desde,
    hasta: filtro.hasta,
    tamanoPagina: filtro.tamanoPagina,
    cursor,
  });
  if (!nuevo.ok) throw new Error(`cursor de histograma inválido: ${nuevo.error.detalle}`);
  return nuevo.valor;
};
