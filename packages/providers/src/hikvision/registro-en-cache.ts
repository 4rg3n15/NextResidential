import type { EquipoRegistrado, RegistroDeEquipos } from './registro-de-equipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F2 (corrección de la 15-L) · EL REGISTRO DE EQUIPOS, RECORDADO UN RATO
 *
 * El veredicto a una terminal tiene un plazo (`TERMINAL_PLAZO_DE_VERIFICACION_S`)
 * y, dentro de él, cada consulta cuenta. Contestar a la terminal exige su
 * dirección y su credencial, y leerlas cuesta una consulta a la base y el
 * descifrado del sobre: hacerlo en CADA reconocimiento gasta plazo que la
 * terminal no tiene.
 *
 * Se recuerda cada equipo encontrado durante `vidaMs` (por omisión 30 s):
 *  · sólo lo ENCONTRADO: un equipo recién dado de alta tiene que verse ya, así
 *    que un «no está» nunca se recuerda;
 *  · `olvidar` lo tira en el acto, y lo llama el proveedor cuando la consola
 *    edita, da de baja, corrige o vuelve a sondear un equipo (C1): la vida
 *    corta es la red de seguridad, no el mecanismo.
 *
 * `[SUPUESTO]` S-96 · 30 s: cubre una ráfaga de reconocimientos sin dejar que
 * una credencial rotada fuera de la consola siga en uso más de medio minuto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class RegistroEnCache implements RegistroDeEquipos {
  private readonly recordados = new Map<
    string,
    { readonly equipo: EquipoRegistrado; readonly hasta: number }
  >();

  constructor(
    private readonly fuente: RegistroDeEquipos,
    private readonly ahora: () => number = () => Date.now(),
    private readonly vidaMs = 30_000,
  ) {}

  async buscar(dispositivoId: string): Promise<EquipoRegistrado | null> {
    const recordado = this.recordados.get(dispositivoId);
    if (recordado !== undefined && recordado.hasta > this.ahora()) return recordado.equipo;
    const equipo = await this.fuente.buscar(dispositivoId);
    if (equipo === null) {
      this.recordados.delete(dispositivoId);
      return null;
    }
    this.recordados.set(dispositivoId, { equipo, hasta: this.ahora() + this.vidaMs });
    return equipo;
  }

  olvidar(dispositivoId: string): void {
    this.recordados.delete(dispositivoId);
    this.fuente.olvidar?.(dispositivoId);
  }
}
