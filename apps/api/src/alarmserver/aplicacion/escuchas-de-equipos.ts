import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Bitacora } from '@ncr/domain-core';
import type { EscuchaActiva, ProveedorDeEquipos } from '@ncr/providers';
import type { EquiposParaEscucha } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS ESCUCHAS DE EQUIPO · A4, ETAPA 15-E
 *
 * Una terminal y un videoportero no publican al servidor de alarma como la
 * cámara: EMITEN por un flujo que la plataforma tiene que abrir y mantener.
 * Esto abre uno por cada equipo activo que emite, lo vuelve a abrir cuando
 * el registro cambia —un videoportero dado de alta desde la consola empieza a
 * oírse sin reiniciar la API— y los cierra al apagar el proceso.
 *
 * Qué transporte usa cada uno lo decide el PROVEEDOR por la capacidad del
 * equipo (`escuchar`), no esto: aquí sólo se sabe qué equipos hay. Y el
 * simulado no se escucha: sus eventos entran por el receptor, y arrancar
 * bucles de reconexión contra equipos que no existen sería ruido en la
 * bitácora de cada suite.
 */
export const INTERVALO_DE_REARME_MS = 30_000;

export interface ParteDeEscuchas {
  readonly armadas: number;
  readonly detenidas: number;
  readonly activas: number;
}

export class EscuchasDeEquipos implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly activas = new Map<string, EscuchaActiva>();
  private temporizador: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly equipos: EquiposParaEscucha,
    private readonly proveedor: Pick<ProveedorDeEquipos, 'escuchar'>,
    private readonly bitacora: Bitacora,
    private readonly opciones: {
      readonly habilitadas: boolean;
      readonly intervaloMs?: number;
    },
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.opciones.habilitadas) {
      this.bitacora.registrar('info', 'escuchas de equipo desactivadas', {
        motivo: 'proveedor simulado: sus eventos entran por el receptor, no por un flujo',
      });
      return;
    }
    await this.rearmar();
    this.temporizador = setInterval(() => {
      void this.rearmar();
    }, this.opciones.intervaloMs ?? INTERVALO_DE_REARME_MS);
    // Un temporizador que mantuviera vivo el proceso impediría apagarlo limpio.
    this.temporizador.unref();
  }

  onApplicationShutdown(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
    for (const escucha of this.activas.values()) escucha.detener();
    this.activas.clear();
  }

  /** Abre lo que falta, cierra lo que sobra. Idempotente: se llama cada rato. */
  async rearmar(): Promise<ParteDeEscuchas> {
    let equipos: Awaited<ReturnType<EquiposParaEscucha['activos']>>;
    try {
      equipos = await this.equipos.activos();
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo leer qué equipos escuchar', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { armadas: 0, detenidas: 0, activas: this.activas.size };
    }

    let armadas = 0;
    const vigentes = new Set(equipos.map((e) => e.dispositivoId));
    for (const equipo of equipos) {
      if (this.activas.has(equipo.dispositivoId)) continue;
      try {
        const escucha = await this.proveedor.escuchar(equipo.dispositivoId);
        this.activas.set(equipo.dispositivoId, escucha);
        armadas += 1;
        this.bitacora.registrar(
          escucha.transporte === 'ninguna' ? 'aviso' : 'info',
          'escucha de equipo',
          {
            copropiedadId: equipo.copropiedadId,
            dispositivoId: equipo.dispositivoId,
            equipo: equipo.nombre,
            transporte: escucha.transporte,
            detalle: escucha.detalle,
          },
        );
      } catch (error) {
        // Se reintenta en el próximo rearme: un equipo apagado al arrancar no
        // puede dejar sin escucha a los demás.
        this.bitacora.registrar('aviso', 'no se pudo abrir la escucha de un equipo', {
          copropiedadId: equipo.copropiedadId,
          dispositivoId: equipo.dispositivoId,
          equipo: equipo.nombre,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let detenidas = 0;
    for (const [dispositivoId, escucha] of this.activas) {
      if (vigentes.has(dispositivoId)) continue;
      escucha.detener();
      this.activas.delete(dispositivoId);
      detenidas += 1;
      this.bitacora.registrar('info', 'escucha de equipo detenida: ya no está activo', {
        dispositivoId,
      });
    }
    return { armadas, detenidas, activas: this.activas.size };
  }
}
