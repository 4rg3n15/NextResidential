import { randomUUID } from 'node:crypto';
import type { CorreoAEnviar, CorreoSaliente, ResultadoDeCorreo } from '@ncr/domain-core';
import type {
  AlmacenDeRespaldos,
  Destinatario,
  DestinatariosDelRespaldo,
  EnviosDeRespaldo,
  IntentoDeEnvio,
  IntentoNuevo,
  RepositorioDeRespaldos,
  RespaldoGuardado,
  RespaldoNuevo,
} from '../aplicacion/respaldo/puertos';

/**
 * D-147 · los adaptadores del respaldo SIN base ni Storage: la suite, y un
 * despliegue con `PERSISTENCIA_DE_EVENTOS=memoria`. Misma semántica que los de
 * verdad (LSP, §2.3): solo inserción, un respaldo por copropiedad y día.
 */
export class RepositorioDeRespaldosEnMemoria implements RepositorioDeRespaldos {
  private readonly filas: RespaldoGuardado[] = [];

  constructor(private readonly ahora: () => Date = () => new Date()) {}

  async desde(copropiedadId: string, fecha: string): Promise<readonly RespaldoGuardado[]> {
    return this.filas
      .filter((r) => r.copropiedadId === copropiedadId && r.fecha >= fecha)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  async porFecha(copropiedadId: string, fecha: string): Promise<RespaldoGuardado | null> {
    return this.filas.find((r) => r.copropiedadId === copropiedadId && r.fecha === fecha) ?? null;
  }

  async registrar(respaldo: RespaldoNuevo): Promise<RespaldoGuardado> {
    const previo = await this.porFecha(respaldo.copropiedadId, respaldo.fecha);
    if (previo !== null) return previo;
    const nuevo: RespaldoGuardado = { ...respaldo, id: randomUUID(), generadoEn: this.ahora() };
    this.filas.push(nuevo);
    return nuevo;
  }

  async ultimos(copropiedadId: string, cuantos: number): Promise<readonly RespaldoGuardado[]> {
    return [...(await this.desde(copropiedadId, '0000-00-00'))].reverse().slice(0, cuantos);
  }

  /** De qué copropiedad es un respaldo: lo que en la base comprueba el trigger de la 0061. */
  copropiedadDe(respaldoId: string): string | undefined {
    return this.filas.find((r) => r.id === respaldoId)?.copropiedadId;
  }
}

export class EnviosDeRespaldoEnMemoria implements EnviosDeRespaldo {
  private readonly envios: IntentoDeEnvio[] = [];

  constructor(
    private readonly respaldos: RepositorioDeRespaldosEnMemoria,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async intentos(
    copropiedadId: string,
    respaldoIds: readonly string[],
  ): Promise<readonly IntentoDeEnvio[]> {
    const ids = new Set(respaldoIds);
    return this.envios
      .filter(
        (i) =>
          ids.has(i.respaldoId) && this.respaldos.copropiedadDe(i.respaldoId) === copropiedadId,
      )
      .sort((a, b) => b.intentadoEn.getTime() - a.intentadoEn.getTime());
  }

  async anotar(copropiedadId: string, intentos: readonly IntentoNuevo[]): Promise<void> {
    for (const i of intentos) {
      if (this.respaldos.copropiedadDe(i.respaldoId) !== copropiedadId) {
        throw new Error('el envío referencia un respaldo inexistente en esta copropiedad');
      }
      this.envios.push({ ...i, intentadoEn: this.ahora() });
    }
  }
}

export class AlmacenDeRespaldosEnMemoria implements AlmacenDeRespaldos {
  readonly objetos = new Map<string, Uint8Array>();

  async guardar(ruta: string, contenido: Uint8Array): Promise<void> {
    this.objetos.set(ruta, contenido);
  }

  async leer(ruta: string): Promise<Uint8Array | null> {
    return this.objetos.get(ruta) ?? null;
  }

  async urlFirmada(ruta: string, segundosDeVida: number): Promise<string> {
    return `memoria://respaldo-de-eventos/${ruta}?vida=${String(segundosDeVida)}`;
  }
}

/** Sin padrón que leer: nadie recibe el correo. */
export class DestinatariosSinBase implements DestinatariosDelRespaldo {
  constructor(private readonly lista: readonly Destinatario[] = []) {}

  async superadministradores(): Promise<readonly Destinatario[]> {
    return this.lista;
  }

  async nombreDeCopropiedad(copropiedadId: string): Promise<string> {
    return copropiedadId;
  }
}

/** Sin SMTP declarado: el respaldo se guarda igual y el envío queda «sin configurar». */
export class CorreoSinConfigurar implements CorreoSaliente {
  readonly configurado = false;

  async enviar(_correo: CorreoAEnviar): Promise<ResultadoDeCorreo> {
    return { estado: 'sin-configurar' };
  }
}
