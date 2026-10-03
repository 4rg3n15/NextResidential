import type { EstadoSesionIntercom, LecturaDePlaca, Vigencia } from '@ncr/domain-core';
import { ProveedorRemoto } from '@ncr/providers';
import type {
  EscuchaActiva,
  FuenteDePlacas,
  ModoDeSalida,
  ProveedorDeEquipos,
  VeredictoRemoto,
} from '@ncr/providers';
import { hechoEnCurso } from './hecho-en-curso';
import type { RutasDeEquipos } from './rutas-de-equipos';
import type { TunelesDeEdge } from './tuneles-de-edge';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · C1 · UN PROVEEDOR, DOS CAMINOS, ELEGIDOS EQUIPO A EQUIPO
 *
 * Detrás de `PROVEEDOR_DE_EQUIPOS` —el mismo token, los mismos puertos— y
 * delante de dos proveedores: el DIRECTO (el de siempre) y uno REMOTO por
 * copropiedad con Edge puente, que habla por su túnel. Cada orden pregunta a
 * `RutasDeEquipos` por dónde va su equipo. Ningún consumidor cambia (OCP).
 *
 * R1 · los métodos OPCIONALES del puerto existen aquí si y sólo si los tiene el
 * directo. B3 · `escuchar` un equipo con puente NO abre nada desde la nube: lo
 * escucha el Edge, y lo que oye llega como publicación por el túnel.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const OPCIONALES = [
  'sondearVideo',
  'decideSolo',
  'olvidar',
  'senalDeEventos',
  'salidasDe',
  'abrirSalida',
  'fijarModoDeSalida',
  'enviarAudioA',
  'recibirAudioDe',
  'cerrarSesionDe',
  'estadoSesionDe',
] as const;

type Opcionales = Required<Pick<ProveedorDeEquipos, (typeof OPCIONALES)[number]>>;

export class ProveedorEnrutado implements ProveedorDeEquipos {
  private readonly remotos = new Map<string, ProveedorRemoto>();
  /** Lo último que se supo de cada equipo, para lo que no puede esperar (sincrónico). */
  private readonly vistos = new Map<string, string | null>();
  private sesionUnica: ProveedorDeEquipos;

  constructor(
    private readonly directo: ProveedorDeEquipos,
    private readonly rutas: RutasDeEquipos,
    private readonly tuneles: TunelesDeEdge,
    private readonly fuente: FuenteDePlacas,
  ) {
    this.sesionUnica = directo;
    const propio = this as unknown as Record<string, unknown>;
    const delDirecto = directo as unknown as Record<string, unknown>;
    for (const nombre of OPCIONALES) {
      if (typeof delDirecto[nombre] !== 'function') propio[nombre] = undefined;
    }
  }

  async hacia(dispositivoId: string): Promise<ProveedorDeEquipos> {
    const copropiedad = await this.rutas.puenteDe(dispositivoId);
    this.vistos.set(dispositivoId, copropiedad);
    return copropiedad === null ? this.directo : this.remoto(copropiedad);
  }

  /** ¿Va este equipo por un Edge? Lo usa quien no habla por el puerto (sonda, corrector). */
  async puenteDe(dispositivoId: string): Promise<string | null> {
    return (await this.hacia(dispositivoId)) === this.directo
      ? null
      : (this.vistos.get(dispositivoId) ?? null);
  }

  private remoto(copropiedadId: string): ProveedorRemoto {
    let remoto = this.remotos.get(copropiedadId);
    if (remoto === undefined) {
      remoto = new ProveedorRemoto({
        sesion: () => this.tuneles.sesionDe(copropiedadId),
        fuente: this.fuente,
        padre: hechoEnCurso,
      });
      this.remotos.set(copropiedadId, remoto);
    }
    return remoto;
  }

  private opcional<K extends keyof Opcionales>(p: ProveedorDeEquipos, k: K): Opcionales[K] {
    const metodo = p[k];
    if (metodo === undefined) throw new Error(`el proveedor no tiene «${k}»`);
    return metodo.bind(p) as Opcionales[K];
  }

  async abrir(id: string, actorId: string) {
    return (await this.hacia(id)).abrir(id, actorId);
  }
  async estado(id: string) {
    return (await this.hacia(id)).estado(id);
  }
  /** Las lecturas del Edge entran por la misma fuente compartida (`publicacion`). */
  suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    return this.directo.suscribir(alLeer);
  }
  async sincronizar(id: string, plantillaId: string, plantilla: Uint8Array, vigencia?: Vigencia) {
    return (await this.hacia(id)).sincronizar(id, plantillaId, plantilla, vigencia);
  }
  async suprimir(id: string, plantillaId: string) {
    return (await this.hacia(id)).suprimir(id, plantillaId);
  }
  async abrirSesion(id: string, operadorId: string): Promise<EstadoSesionIntercom> {
    this.sesionUnica = await this.hacia(id);
    return this.sesionUnica.abrirSesion(id, operadorId);
  }
  enviarAudio(fragmento: Uint8Array) {
    return this.sesionUnica.enviarAudio(fragmento);
  }
  recibirAudio() {
    return this.sesionUnica.recibirAudio();
  }
  cerrarSesion(motivo: string) {
    return this.sesionUnica.cerrarSesion(motivo);
  }
  estadoSesion() {
    return this.sesionUnica.estadoSesion();
  }

  // ── Lo que el paquete añade ───────────────────────────────────────────────
  async capacidadesDe(id: string) {
    return (await this.hacia(id)).capacidadesDe(id);
  }
  async fijarBloqueo(id: string, bloqueado: boolean) {
    return (await this.hacia(id)).fijarBloqueo(id, bloqueado);
  }
  async responderVerificacionRemota(id: string, veredicto: VeredictoRemoto) {
    return (await this.hacia(id)).responderVerificacionRemota(id, veredicto);
  }
  async escuchar(id: string): Promise<EscuchaActiva> {
    const destino = await this.hacia(id);
    if (destino === this.directo) return this.directo.escuchar(id);
    return {
      dispositivoId: id,
      transporte: 'escucha',
      detalle: 'la escucha la tiene el Edge del conjunto (ADR-035)',
      detener: () => undefined,
    };
  }
  async origenDeVideo(id: string) {
    return (await this.hacia(id)).origenDeVideo(id);
  }
  async sondearVideo(id: string) {
    return this.opcional(await this.hacia(id), 'sondearVideo')(id);
  }
  async decideSolo(id: string) {
    return this.opcional(await this.hacia(id), 'decideSolo')(id);
  }
  olvidar(id: string): void {
    this.rutas.olvidar(id);
    this.directo.olvidar?.(id);
    const copropiedad = this.vistos.get(id);
    if (copropiedad !== undefined && copropiedad !== null) this.remoto(copropiedad).olvidar(id);
    this.vistos.delete(id);
  }
  senalDeEventos(id: string) {
    const copropiedad = this.vistos.get(id);
    return copropiedad === undefined || copropiedad === null
      ? this.opcional(this.directo, 'senalDeEventos')(id)
      : null;
  }
  async salidasDe(id: string) {
    return this.opcional(await this.hacia(id), 'salidasDe')(id);
  }
  async abrirSalida(id: string, puerta: number, actorId: string) {
    return this.opcional(await this.hacia(id), 'abrirSalida')(id, puerta, actorId);
  }
  async fijarModoDeSalida(id: string, puerta: number, modo: ModoDeSalida, actorId: string) {
    return this.opcional(await this.hacia(id), 'fijarModoDeSalida')(id, puerta, modo, actorId);
  }
  async enviarAudioA(id: string, fragmento: Uint8Array) {
    return this.opcional(await this.hacia(id), 'enviarAudioA')(id, fragmento);
  }
  recibirAudioDe(id: string): AsyncIterable<Uint8Array> {
    const abrir = async () =>
      this.opcional(await this.hacia(id), 'recibirAudioDe')(id)[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]: () => {
        let iterador: Promise<AsyncIterator<Uint8Array>> | null = null;
        return {
          next: async () => (await (iterador ??= abrir())).next(),
          return: async () => {
            const abierto = await iterador?.catch(() => null);
            return (await abierto?.return?.()) ?? { value: undefined, done: true };
          },
        };
      },
    };
  }
  async cerrarSesionDe(id: string, motivo: string) {
    return this.opcional(await this.hacia(id), 'cerrarSesionDe')(id, motivo);
  }
  async estadoSesionDe(id: string) {
    return this.opcional(await this.hacia(id), 'estadoSesionDe')(id);
  }
}
