/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · C1/B2 · EL LADO DEL EDGE: cumple las órdenes que llegan por el túnel
 *
 * Con el proveedor REAL del Edge —el mismo `packages/providers` que usaba la
 * nube— y contra los equipos de su red. Cuatro reglas que no se negocian:
 *
 *  1. Sólo los métodos de la lista (`PERMITIDOS`). Un nombre que no está no se
 *     «intenta»: es un pedido fuera de protocolo.
 *  2. Sólo equipos de ESTE Edge: un dispositivo que no conoce es
 *     `EquipoNoRegistrado` (RN-15, segunda barrera; la primera es la API, que
 *     sólo enruta al Edge de la copropiedad del equipo).
 *  3. Un solo actor (B2): si la orden pertenece a un hecho que el Edge ya
 *     resolvió por contingencia, se RECHAZA (`HechoYaResueltoEnElEdge`). Llegó
 *     tarde, y ejecutarla sería accionar dos veces.
 *  4. La URL de video con credencial no sale del conjunto (D4): `origenDeVideo`
 *     contesta `null`; el video lo sirve el go2rtc que corre junto al Edge.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import type { EscuchaActiva } from '../nucleo/escucha';
import { EquipoNoRegistrado } from '../hikvision/registro-de-equipos';
import { HechoYaResueltoEnElEdge, ProtocoloInvalido } from './errores-remotos';

export { HechoYaResueltoEnElEdge };
import type { ContextoDePedido, SesionDeTunel } from './sesion-de-tunel';

const PERMITIDOS = new Set([
  'abrir',
  'estado',
  'capacidadesDe',
  'fijarBloqueo',
  'responderVerificacionRemota',
  'sincronizar',
  'suprimir',
  'escuchar',
  'origenDeVideo',
  'sondearVideo',
  'decideSolo',
  'salidasDe',
  'abrirSalida',
  'abrirSesion',
  'cerrarSesion',
  'estadoSesion',
  'cerrarSesionDe',
  'estadoSesionDe',
]);
/** Los que no llevan dispositivo: la sesión de audio única del puerto. */
const SIN_DISPOSITIVO = new Set(['cerrarSesion', 'estadoSesion']);

export interface OpcionesDelEjecutor {
  /** ¿Es un equipo de este Edge? (su registro local). */
  readonly conoce: (dispositivoId: string) => boolean;
  /**
   * B2 · ¿sigue en manos de la nube el hecho `padre`? Devuelve `false` si el
   * Edge ya lo resolvió por contingencia. Ausente: no hay hechos en vuelo.
   */
  readonly padreVigente?: (padre: string) => boolean;
  readonly registrar?: (mensaje: string, contexto?: unknown) => void;
}

type Metodo = (...args: unknown[]) => unknown;

export const ejecutarOrdenes = (
  sesion: SesionDeTunel,
  proveedor: ProveedorDeEquipos,
  opciones: OpcionesDelEjecutor,
): void => {
  const escuchas = new Map<string, EscuchaActiva>();

  const exigirEquipo = (id: unknown): string => {
    if (typeof id !== 'string' || !opciones.conoce(id)) throw new EquipoNoRegistrado(String(id));
    return id;
  };

  sesion.atender('equipo', async (carga: unknown, contexto: ContextoDePedido) => {
    const { metodo, args } = (carga ?? {}) as { metodo?: unknown; args?: unknown };
    if (typeof metodo !== 'string' || !PERMITIDOS.has(metodo) || !Array.isArray(args)) {
      throw new ProtocoloInvalido(`orden «${String(metodo)}» no admitida`);
    }
    if (!SIN_DISPOSITIVO.has(metodo)) exigirEquipo(args[0]);
    if (contexto.padre !== undefined && opciones.padreVigente?.(contexto.padre) === false) {
      opciones.registrar?.('orden de la nube rechazada: el hecho ya se resolvió en el Edge', {
        metodo,
        dispositivoId: args[0],
      });
      throw new HechoYaResueltoEnElEdge(contexto.padre);
    }
    const funcion = (proveedor as unknown as Record<string, Metodo | undefined>)[metodo];
    if (typeof funcion !== 'function')
      throw new ProtocoloInvalido(`el proveedor no tiene «${metodo}»`);
    const valor = await funcion.apply(proveedor, args);
    // D4 · se pregunta al proveedor (un equipo desconocido sigue rechazando),
    // pero la URL con la credencial se queda aquí: el video lo sirve el go2rtc local.
    if (metodo === 'origenDeVideo') return null;
    if (metodo !== 'escuchar') return valor;
    const escucha = valor as EscuchaActiva;
    escuchas.get(escucha.dispositivoId)?.detener();
    escuchas.set(escucha.dispositivoId, escucha);
    return {
      dispositivoId: escucha.dispositivoId,
      transporte: escucha.transporte,
      detalle: escucha.detalle,
      ultimaSenal: escucha.ultimaSenal?.() ?? null,
    };
  });

  sesion.alAviso('equipo.detener', (c) => {
    const { dispositivoId } = (c ?? {}) as { dispositivoId?: unknown };
    if (typeof dispositivoId !== 'string') return;
    escuchas.get(dispositivoId)?.detener();
    escuchas.delete(dispositivoId);
  });

  sesion.alAviso('equipo.olvidar', (c) => {
    const { dispositivoId } = (c ?? {}) as { dispositivoId?: unknown };
    if (typeof dispositivoId === 'string' && opciones.conoce(dispositivoId)) {
      proveedor.olvidar?.(dispositivoId);
    }
  });

  // ── Audio: un canal binario por sentido, leído EN ORDEN ────────────────────
  const canalDe = (args: unknown): { dispositivoId: string | null; canal: number } => {
    const [dispositivoId, canal] = Array.isArray(args) ? args : [];
    if (typeof canal !== 'number') throw new ProtocoloInvalido('canal de audio');
    return { dispositivoId: dispositivoId === null ? null : exigirEquipo(dispositivoId), canal };
  };

  sesion.atender('audio.envio', async (carga: unknown) => {
    const { dispositivoId, canal } = canalDe((carga as { args?: unknown }).args);
    const cola = sesion.canal(canal);
    void (async () => {
      for await (const trozo of cola) {
        try {
          await (dispositivoId === null
            ? proveedor.enviarAudio(trozo)
            : (proveedor.enviarAudioA?.(dispositivoId, trozo) ?? proveedor.enviarAudio(trozo)));
        } catch (error) {
          sesion.avisar('audio.fallo', { canal, error });
          cola.cerrar('el equipo rechazó el audio');
          return;
        }
      }
    })();
    return null;
  });

  sesion.atender('audio.recepcion', async (carga: unknown) => {
    const { dispositivoId, canal } = canalDe((carga as { args?: unknown }).args);
    const cola = sesion.canal(canal);
    const flujo =
      dispositivoId === null
        ? proveedor.recibirAudio()
        : (proveedor.recibirAudioDe?.(dispositivoId) ?? proveedor.recibirAudio());
    void (async () => {
      const iterador = flujo[Symbol.asyncIterator]();
      try {
        for (;;) {
          const { value, done } = await iterador.next();
          if (done === true || cola.cerrado) break;
          cola.enviar(value);
        }
      } catch (error) {
        opciones.registrar?.('el audio del equipo se cortó', { error: String(error) });
      } finally {
        await iterador.return?.();
        cola.cerrar('fin del audio del equipo');
      }
    })();
    return null;
  });
};
