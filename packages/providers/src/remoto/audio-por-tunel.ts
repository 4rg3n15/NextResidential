/**
 * 15-Q2 · E1 · el audio del intercom por el túnel, del lado de quien ordena.
 *
 * El audio no viaja en pedidos: un pedido por trozo se atendería en paralelo y
 * podría desordenarse. Va por CANALES BINARIOS (A2), uno por sentido y equipo,
 * abiertos con un pedido `audio.envio` / `audio.recepcion` que dice al Edge qué
 * canal leer o escribir. `null` como equipo es la sesión única del puerto.
 *
 * Un fallo del equipo al recibir el audio llega como aviso `audio.fallo` (el
 * envío no espera respuesta por trozo) y se lanza en el SIGUIENTE envío.
 */
import { EdgeDesconectado } from './errores-remotos';
import type { ColaDeCanal } from './cola-de-canal';
import type { SesionDeTunel } from './sesion-de-tunel';

export class AudioPorTunel {
  private readonly envios = new Map<string, Promise<ColaDeCanal>>();
  private readonly fallos = new Map<number, Error>();

  constructor(
    private readonly sesionVigente: () => SesionDeTunel,
    private readonly plazoMs: number,
  ) {}

  /** Se llama una vez por sesión del túnel: los fallos del equipo vuelven por aquí. */
  instalarEn(sesion: SesionDeTunel): void {
    sesion.atender('audio.fallo', (c) => {
      const { canal, error } = c as { canal: number; error: Error };
      this.fallos.set(canal, error);
    });
  }

  async enviar(dispositivoId: string | null, fragmento: Uint8Array): Promise<void> {
    const clave = dispositivoId ?? '';
    let envio = this.envios.get(clave);
    if (envio === undefined) {
      const canal = this.sesionVigente().canales.abrir();
      envio = this.pedir('audio.envio', dispositivoId, canal.id).then(() => canal);
      this.envios.set(clave, envio);
      envio.catch(() => this.envios.delete(clave));
    }
    const canal = await envio;
    const fallo = this.fallos.get(canal.id);
    if (fallo !== undefined) {
      this.envios.delete(clave);
      this.fallos.delete(canal.id);
      throw fallo;
    }
    if (canal.cerrado) {
      this.envios.delete(clave);
      throw new EdgeDesconectado(`el canal de audio se cerró: ${canal.motivoDeCierre}`);
    }
    canal.enviar(fragmento);
  }

  async cerrarEnvio(dispositivoId: string | null): Promise<void> {
    const envio = this.envios.get(dispositivoId ?? '');
    this.envios.delete(dispositivoId ?? '');
    if (envio !== undefined) (await envio.catch(() => null))?.cerrar('sesión de audio cerrada');
  }

  recibir(dispositivoId: string | null): AsyncIterable<Uint8Array> {
    const abrir = async (): Promise<ColaDeCanal> => {
      const canal = this.sesionVigente().canales.abrir();
      await this.pedir('audio.recepcion', dispositivoId, canal.id);
      return canal;
    };
    return {
      [Symbol.asyncIterator]: () => {
        let canal: Promise<ColaDeCanal> | null = null;
        return {
          next: async () => {
            canal ??= abrir();
            return (await canal)[Symbol.asyncIterator]().next();
          },
          return: async () => {
            (await canal?.catch(() => null))?.cerrar('el lector dejó de leer');
            return { value: undefined, done: true };
          },
        };
      },
    };
  }

  private pedir(nombre: string, dispositivoId: string | null, canal: number): Promise<unknown> {
    return this.sesionVigente().pedir(
      nombre,
      { args: [dispositivoId, canal] },
      { plazoMs: this.plazoMs },
    );
  }
}
