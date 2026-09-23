import type { ModoDeTerminal } from '../terminal/terminal-facial';

/**
 * QUÉ EQUIPOS HAY Y CÓMO SE LLEGA A ELLOS.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ES UN PUERTO, Y POR ESO ESTÁ AQUÍ Y NO EN LA API
 *
 * `HikvisionProvider` recibe un identificador de dispositivo —el del dominio— y
 * tiene que saber a qué dirección hablar. Quien conoce esa correspondencia es
 * la base de datos de la API, y quien no puede nombrarla es este paquete.
 *
 * La salida es un puerto: aquí se declara **qué hace falta saber** de un
 * equipo, y la API lo implementa leyendo la tabla y descifrando el sobre de la
 * credencial (A.1). La alternativa —que el proveedor leyera la base— habría
 * metido PostgreSQL dentro del paquete de adaptadores de hardware.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA CREDENCIAL VIAJA EN CLARO AQUÍ DENTRO, Y NO PUEDE SER DE OTRA FORMA
 *
 * Para hablar con el equipo hay que presentarle la clave. Lo que sí es
 * exigible, y se cumple: **no se registra, no se devuelve y no sale de este
 * proceso**. El sobre cifrado vive en la base (migración 0032), el material de
 * llave en el entorno, y lo que cruza esta frontera es el valor descifrado en
 * memoria para una petición (RN-21).
 */

export type TipoDeEquipoRegistrado =
  | 'camara_lpr'
  | 'terminal_facial'
  | 'intercom'
  | 'rele'
  | 'controlador_io';

export interface EquipoRegistrado {
  readonly dispositivoId: string;
  readonly tipo: TipoDeEquipoRegistrado;
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: 'http' | 'https';
  readonly usuario: string;
  readonly clave: string;
  /** Cuál de las barreras del equipo. Se lee del aparato, no se supone. */
  readonly canalBarrera?: number | null;
  readonly numeroDePuerta?: number | null;
  readonly canalDeAudio?: number | null;
  /**
   * Se **declara**, no se deduce: es la decisión arquitectónica más importante
   * del recorrido facial y esconderla dentro de una rama la haría invisible.
   */
  readonly modoDeTerminal?: ModoDeTerminal;
  /**
   * El canal de audio del equipo viene **deshabilitado de fábrica**. Mientras
   * sea `false`, el adaptador no emite una sola petición hacia él: encender por
   * nuestra cuenta una vía de audio hacia la calle sería una decisión de
   * seguridad tomada por el código.
   */
  readonly canalDeAudioHabilitado?: boolean;
}

export interface RegistroDeEquipos {
  buscar(dispositivoId: string): Promise<EquipoRegistrado | null>;
}

/** Registro de memoria: lo que usan las pruebas y el arranque sin base. */
export class RegistroEnMemoria implements RegistroDeEquipos {
  private readonly equipos = new Map<string, EquipoRegistrado>();

  constructor(equipos: readonly EquipoRegistrado[] = []) {
    for (const equipo of equipos) this.equipos.set(equipo.dispositivoId, equipo);
  }

  async buscar(dispositivoId: string): Promise<EquipoRegistrado | null> {
    return this.equipos.get(dispositivoId) ?? null;
  }

  registrar(equipo: EquipoRegistrado): void {
    this.equipos.set(equipo.dispositivoId, equipo);
  }
}

export class EquipoNoRegistrado extends Error {
  constructor(readonly dispositivoId: string) {
    super(
      `No hay ningún equipo registrado con el identificador ${dispositivoId}. Dese de alta ` +
        'desde la consola antes de operar contra él: adivinar una dirección no es una opción',
    );
    this.name = 'EquipoNoRegistrado';
  }
}
