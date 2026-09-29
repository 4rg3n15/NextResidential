import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { EquiposParaEscucha } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C4 (ETAPA 15-L) · EL LATIDO DE CADA EQUIPO, DE UNA SEÑAL REAL
 *
 * El tablero pinta «En línea / Degradado / Fuera de línea» a partir de
 * `dispositivos.ultimo_latido`, y hasta la 15-L nadie lo escribía: con
 * PostgreSQL, todos los equipos salían fuera de línea. Aquí, cada pasada:
 *
 *  1. Si la ESCUCHA del equipo recibió algo hace poco —un evento o el propio
 *     latido del flujo—, esa es la señal: no cuesta una petición.
 *  2. Si no, se le PREGUNTA al equipo (`estado`, que el proveedor resuelve con
 *     una lectura real de su identidad). Sólo `en_linea` cuenta: un equipo que
 *     contesta con la credencial rechazada está vivo, pero no operable, y la
 *     consola no debe pintarlo en verde.
 *  3. Lo que no contesta no se escribe: el latido envejece y el tablero lo
 *     pasa a degradado y a fuera de línea con los umbrales de la copropiedad.
 *
 * Es el mismo patrón que las escuchas: vive con el proceso, por intervalo.
 * `intervaloMs: 0` lo apaga (las suites que no lo miran).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const INTERVALO_DE_LATIDO_MS = 60_000;
/** Una señal de la escucha más vieja que esto no vale: se le pregunta. */
export const FRESCURA_DE_SENAL_MS = 90_000;
/** Cuántos equipos se sondean a la vez. */
const EN_PARALELO = 4;

export interface ParteDeLatidos {
  readonly porSenal: number;
  readonly porSondeo: number;
  readonly sinRespuesta: number;
}

export interface SenalesDeEscucha {
  ultimaSenal(dispositivoId: string): Date | null;
}

export interface EstadoObservadoDelLatido {
  readonly estadoSalud: 'saludable' | 'degradado' | 'caido';
  readonly sondeo: 'alcanzado' | 'credencial' | 'inalcanzable' | null;
  readonly credencialRechazada: boolean;
}

export interface RegistroDeLatidos {
  registrarLatido(copropiedadId: string, dispositivoId: string, ahora: Date): Promise<void>;
  /** E5 (15-M) · `estado_salud` con la realidad de ESTA pasada. Opcional para dobles antiguos. */
  registrarEstado?(
    copropiedadId: string,
    dispositivoId: string,
    observado: EstadoObservadoDelLatido,
    ahora: Date,
  ): Promise<void>;
}

export class LatidosDeEquipos implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private enCurso = false;

  constructor(
    private readonly equipos: EquiposParaEscucha,
    private readonly proveedor: Pick<ProveedorDeEquipos, 'estado'>,
    private readonly senales: SenalesDeEscucha,
    private readonly latidos: RegistroDeLatidos,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
    private readonly opciones: { readonly intervaloMs?: number } = {},
  ) {}

  onApplicationBootstrap(): void {
    const intervalo = this.opciones.intervaloMs ?? INTERVALO_DE_LATIDO_MS;
    if (intervalo <= 0) return;
    void this.pasada();
    this.temporizador = setInterval(() => void this.pasada(), intervalo);
    this.temporizador.unref();
  }

  /** Otros fallos (15-M) · antes del cierre del pool; ver `EscuchasDeEquipos`. */
  beforeApplicationShutdown(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  /** Una vuelta por todos los equipos activos. No se solapa con la anterior. */
  async pasada(): Promise<ParteDeLatidos> {
    if (this.enCurso) return { porSenal: 0, porSondeo: 0, sinRespuesta: 0 };
    this.enCurso = true;
    const parte = { porSenal: 0, porSondeo: 0, sinRespuesta: 0 };
    try {
      const pendientes = [...(await this.equipos.activos())];
      const trabajar = async (): Promise<void> => {
        for (let equipo = pendientes.shift(); equipo !== undefined; equipo = pendientes.shift()) {
          parte[await this.uno(equipo.copropiedadId, equipo.dispositivoId)] += 1;
        }
      };
      await Promise.all(Array.from({ length: EN_PARALELO }, trabajar));
    } catch (error) {
      this.bitacora.registrar('aviso', 'latido de equipos: no se pudo leer el registro', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.enCurso = false;
    }
    return parte;
  }

  private async uno(copropiedadId: string, dispositivoId: string): Promise<keyof ParteDeLatidos> {
    const ahora = this.reloj.ahora();
    const senal = this.senales.ultimaSenal(dispositivoId);
    try {
      if (senal !== null && ahora.getTime() - senal.getTime() <= FRESCURA_DE_SENAL_MS) {
        await this.latidos.registrarLatido(copropiedadId, dispositivoId, senal);
        await this.anotar(copropiedadId, dispositivoId, 'saludable', null, false);
        return 'porSenal';
      }
      /**
       * E5 (15-M) · el sondeo se ESCRIBE, conteste lo que conteste: `degradado`
       * es «contesta pero rechaza la credencial» (el proveedor lo separa así) y
       * `fuera_de_linea` es «no contesta». Antes sólo se escribía el latido del
       * que respondía bien y `estado_salud` se quedaba en `saludable` para
       * siempre, también en el equipo inalcanzable del 28/09.
       */
      const estado = await this.proveedor.estado(dispositivoId);
      if (estado === 'en_linea') {
        await this.latidos.registrarLatido(copropiedadId, dispositivoId, this.reloj.ahora());
        await this.anotar(copropiedadId, dispositivoId, 'saludable', 'alcanzado', false);
        return 'porSondeo';
      }
      if (estado === 'degradado') {
        await this.anotar(copropiedadId, dispositivoId, 'degradado', 'credencial', true);
      } else {
        await this.anotar(copropiedadId, dispositivoId, 'caido', 'inalcanzable', false);
      }
      return 'sinRespuesta';
    } catch (error) {
      this.bitacora.registrar('aviso', 'latido de equipo: sin respuesta', {
        dispositivoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 'sinRespuesta';
    }
  }

  private async anotar(
    copropiedadId: string,
    dispositivoId: string,
    estadoSalud: EstadoObservadoDelLatido['estadoSalud'],
    sondeo: EstadoObservadoDelLatido['sondeo'],
    credencialRechazada: boolean,
  ): Promise<void> {
    await this.latidos.registrarEstado?.(
      copropiedadId,
      dispositivoId,
      { estadoSalud, sondeo, credencialRechazada },
      this.reloj.ahora(),
    );
  }
}
