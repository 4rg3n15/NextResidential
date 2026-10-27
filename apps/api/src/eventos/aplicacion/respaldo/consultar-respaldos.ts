import type {
  AlmacenDeRespaldos,
  EnviosDeRespaldo,
  IntentoDeEnvio,
  RepositorioDeRespaldos,
} from './puertos';

/**
 * D-147 · LOS RESPALDOS EN INFORMES: la lista y la descarga.
 *
 * El estado del envío de cada día es el resumen de los ÚLTIMOS intentos por
 * destinatario: «enviado» si alguno lo recibió y ninguno está pendiente de un
 * fallo, «error» si el último intento de alguien falló, «sin configurar» si
 * no hay SMTP, «pendiente» si aún no se intentó.
 *
 * La descarga es una URL firmada de vida corta (RN-21), firmada en el momento:
 * nunca se guarda una URL.
 */
export const VIDA_DE_LA_DESCARGA_S = 300;
export const RESPALDOS_EN_LA_LISTA = 90;

export type EstadoDelEnvio = 'enviado' | 'error' | 'sin_configurar' | 'pendiente';

export interface RespaldoEnLaLista {
  readonly fecha: string;
  readonly numeroDeEventos: number;
  readonly permitidos: number;
  readonly negados: number;
  readonly sha256: string;
  readonly tamanoBytes: number;
  readonly generadoEn: Date;
  readonly estadoDelEnvio: EstadoDelEnvio;
  /** Destinatarios a los que llegó. */
  readonly enviadosA: number;
  /** El último error, sin datos personales, si lo hubo. */
  readonly ultimoError: string | null;
}

export const resumirEnvio = (
  intentos: readonly IntentoDeEnvio[],
): Pick<RespaldoEnLaLista, 'estadoDelEnvio' | 'enviadosA' | 'ultimoError'> => {
  const porDestinatario = new Map<string, IntentoDeEnvio>();
  for (const i of intentos) {
    const previo = porDestinatario.get(i.destinatarioId);
    if (previo === undefined || previo.intentadoEn < i.intentadoEn) {
      porDestinatario.set(i.destinatarioId, i);
    }
  }
  const ultimos = [...porDestinatario.values()];
  const enviadosA = ultimos.filter((i) => i.resultado === 'enviado').length;
  const conError = ultimos.filter((i) => i.resultado === 'error');
  const estadoDelEnvio: EstadoDelEnvio =
    ultimos.length === 0
      ? 'pendiente'
      : conError.length > 0
        ? 'error'
        : enviadosA > 0
          ? 'enviado'
          : 'sin_configurar';
  return { estadoDelEnvio, enviadosA, ultimoError: conError[0]?.error ?? null };
};

export class ConsultarRespaldos {
  constructor(
    private readonly respaldos: RepositorioDeRespaldos,
    private readonly envios: EnviosDeRespaldo,
    private readonly almacen: AlmacenDeRespaldos,
  ) {}

  async listar(copropiedadId: string): Promise<readonly RespaldoEnLaLista[]> {
    const lista = await this.respaldos.ultimos(copropiedadId, RESPALDOS_EN_LA_LISTA);
    const intentos = await this.envios.intentos(
      copropiedadId,
      lista.map((r) => r.id),
    );
    return lista.map((r) => ({
      fecha: r.fecha,
      numeroDeEventos: r.numeroDeEventos,
      permitidos: r.permitidos,
      negados: r.negados,
      sha256: r.sha256,
      tamanoBytes: r.tamanoBytes,
      generadoEn: r.generadoEn,
      ...resumirEnvio(intentos.filter((i) => i.respaldoId === r.id)),
    }));
  }

  /** `null` si ese día no tiene respaldo en esa copropiedad. */
  async descarga(
    copropiedadId: string,
    fecha: string,
  ): Promise<{ readonly url: string; readonly segundosDeVida: number } | null> {
    const respaldo = await this.respaldos.porFecha(copropiedadId, fecha);
    if (respaldo === null) return null;
    return {
      url: await this.almacen.urlFirmada(respaldo.ruta, VIDA_DE_LA_DESCARGA_S),
      segundosDeVida: VIDA_DE_LA_DESCARGA_S,
    };
  }
}
