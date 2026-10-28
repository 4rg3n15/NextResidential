import type { CorreoSaliente, Reloj } from '@ncr/domain-core';
import { sha256 } from './generar-respaldo';
import type {
  AlmacenDeRespaldos,
  Destinatario,
  DestinatariosDelRespaldo,
  EnviosDeRespaldo,
  IntentoDeEnvio,
  IntentoNuevo,
  RespaldoGuardado,
} from './puertos';

/**
 * D-147 · ENVÍA POR CORREO LOS RESPALDOS PENDIENTES
 *
 * Un respaldo está pendiente para un destinatario mientras su ÚLTIMO intento
 * no sea «enviado». Así un envío hecho no se repite y uno fallido se reintenta
 * en la siguiente ejecución, sin reescribir nada: cada intento es una fila
 * nueva (C-68).
 *
 * Del más antiguo al más reciente, y como mucho `ENVIOS_POR_EJECUCION` correos
 * por copropiedad y ejecución: tras una caída larga no salen 31 correos de
 * golpe. [SUPUESTO] S-147-01: el tope es por copropiedad; uno común dejaría la
 * última copropiedad sin turno mientras las primeras se ponen al día.
 *
 * Sin SMTP configurado no se prepara ningún correo: se anota «sin configurar»
 * una vez por respaldo y destinatario, y el respaldo queda guardado igual.
 */
export const ENVIOS_POR_EJECUCION = 7;
/** Más que esto no viaja adjunto: se manda un enlace firmado (RN-21). */
export const LIMITE_DEL_ADJUNTO_BYTES = 10 * 1024 * 1024;
/**
 * [SUPUESTO] S-147-02 · la vida del enlace del correo. «Vida corta» (RN-21)
 * frente a que el correo se lea: con minutos, caducaría antes de abrirlo. La
 * descarga desde Informes, en cambio, se firma en el momento con 5 minutos.
 */
export const VIDA_DEL_ENLACE_DEL_CORREO_S = 24 * 3600;

export interface ParteDelEnvio {
  readonly enviados: number;
  readonly fallidos: number;
  readonly sinConfigurar: number;
}

/** El último intento de cada par respaldo-destinatario. */
const ultimos = (intentos: readonly IntentoDeEnvio[]): ReadonlyMap<string, IntentoDeEnvio> => {
  const mapa = new Map<string, IntentoDeEnvio>();
  for (const i of intentos) {
    const clave = `${i.respaldoId}|${i.destinatarioId}`;
    const previo = mapa.get(clave);
    if (previo === undefined || previo.intentadoEn < i.intentadoEn) mapa.set(clave, i);
  }
  return mapa;
};

/** El motivo de un fallo, sin direcciones de correo ni caracteres de control. */
const motivoSinDatos = (detalle: string): string =>
  (
    detalle
      .replace(/[^\s@<>]+@[^\s@<>]+/g, '[dirección]')
      .replace(/\p{Cc}/gu, ' ')
      .trim() || 'fallo sin detalle'
  ).slice(0, 500);

export const asuntoDelRespaldo = (r: RespaldoGuardado, copropiedad: string): string =>
  `Eventos del ${r.fecha} · ${copropiedad}`;

export const cuerpoDelRespaldo = (
  r: RespaldoGuardado,
  copropiedad: string,
  enlace: string | null,
): string =>
  [
    `Respaldo diario de los eventos de ${copropiedad}, del ${r.fecha} (hora de Bogotá).`,
    '',
    `Eventos: ${String(r.numeroDeEventos)}`,
    `Permitidos: ${String(r.permitidos)}`,
    `Negados: ${String(r.negados)}`,
    `Huella SHA-256 del fichero: ${r.sha256}`,
    '',
    enlace === null
      ? 'El fichero va adjunto.'
      : `El fichero pesa más de 10 MB y no va adjunto. Descárguelo en las próximas 24 horas ` +
        `con este enlace: ${enlace}`,
    '',
    'Es una copia: el histórico completo sigue en Next Control.',
  ].join('\n');

/** Lo que sale de un envío para cada destinatario, sin el par respaldo-destinatario. */
type Intento = Omit<IntentoNuevo, 'respaldoId' | 'destinatarioId'>;

/** El servidor aceptó el correo para otros y rechazó esta dirección: se reintenta. */
const RECHAZADO: Intento = {
  resultado: 'error',
  error: 'el servidor de correo rechazó la dirección',
  enviadoEn: null,
  conEnlace: false,
};

export class EnviarRespaldos {
  constructor(
    private readonly envios: EnviosDeRespaldo,
    private readonly almacen: AlmacenDeRespaldos,
    private readonly destinatarios: DestinatariosDelRespaldo,
    private readonly correo: CorreoSaliente,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    copropiedadId: string,
    candidatos: readonly RespaldoGuardado[],
    actorId: string,
  ): Promise<ParteDelEnvio> {
    const quienes = await this.destinatarios.superadministradores(copropiedadId);
    if (quienes.length === 0 || candidatos.length === 0) {
      return { enviados: 0, fallidos: 0, sinConfigurar: 0 };
    }
    const previos = ultimos(
      await this.envios.intentos(
        copropiedadId,
        candidatos.map((r) => r.id),
      ),
    );
    const pendientesDe = (r: RespaldoGuardado): readonly Destinatario[] =>
      quienes.filter((d) => previos.get(`${r.id}|${d.id}`)?.resultado !== 'enviado');

    if (!this.correo.configurado) {
      const nuevos: IntentoNuevo[] = candidatos.flatMap((r) =>
        pendientesDe(r)
          // Una vez: si ya consta «sin configurar», no se repite cada día.
          .filter((d) => previos.get(`${r.id}|${d.id}`)?.resultado !== 'sin_configurar')
          .map((d) => ({
            respaldoId: r.id,
            destinatarioId: d.id,
            resultado: 'sin_configurar' as const,
            error: null,
            enviadoEn: null,
            conEnlace: false,
          })),
      );
      if (nuevos.length > 0) await this.envios.anotar(copropiedadId, nuevos, actorId);
      return { enviados: 0, fallidos: 0, sinConfigurar: nuevos.length };
    }

    const copropiedad = await this.destinatarios.nombreDeCopropiedad(copropiedadId);
    // Lo que nunca falló va primero y los reintentos detrás, cada grupo del más
    // antiguo al más reciente: un respaldo que falla siempre (su fichero ya no
    // está) no puede ocupar los siete turnos de cada ejecución y dejar sin
    // enviar los días siguientes durante un mes.
    const yaFallo = (r: RespaldoGuardado): boolean =>
      pendientesDe(r).some((d) => previos.get(`${r.id}|${d.id}`)?.resultado === 'error');
    const enOrden = [...candidatos.filter((r) => !yaFallo(r)), ...candidatos.filter(yaFallo)];

    let enviados = 0;
    let fallidos = 0;
    let correos = 0;
    for (const r of enOrden) {
      if (correos >= ENVIOS_POR_EJECUCION) break;
      const pendientes = pendientesDe(r);
      if (pendientes.length === 0) continue;
      correos += 1;
      const { intento, rechazados } = await this.enviarUno(r, copropiedad, pendientes);
      const porDestinatario = pendientes.map((d) =>
        rechazados.has(d.correo.toLowerCase())
          ? { ...RECHAZADO, conEnlace: intento.conEnlace }
          : intento,
      );
      await this.envios.anotar(
        copropiedadId,
        porDestinatario.map((i, n) => ({
          ...i,
          respaldoId: r.id,
          destinatarioId: pendientes[n]?.id ?? '',
        })),
        actorId,
      );
      for (const i of porDestinatario) {
        if (i.resultado === 'enviado') enviados += 1;
        else fallidos += 1;
      }
    }
    return { enviados, fallidos, sinConfigurar: 0 };
  }

  private async enviarUno(
    r: RespaldoGuardado,
    copropiedad: string,
    pendientes: readonly Destinatario[],
  ): Promise<{ readonly intento: Intento; readonly rechazados: ReadonlySet<string> }> {
    const sinRechazos = (intento: Intento) => ({ intento, rechazados: new Set<string>() });
    const fallo = (detalle: string, conEnlace = false) => ({
      resultado: 'error' as const,
      error: motivoSinDatos(detalle),
      enviadoEn: null,
      conEnlace,
    });
    try {
      const contenido = await this.almacen.leer(r.ruta);
      if (contenido === null) {
        return sinRechazos(fallo('el fichero del respaldo no está en Storage'));
      }
      // Lo que se envía es lo que se guardó: si la huella no coincide, no sale.
      if (sha256(contenido) !== r.sha256) {
        return sinRechazos(
          fallo('la huella del fichero guardado no coincide con la de su constancia'),
        );
      }
      const conEnlace = contenido.byteLength > LIMITE_DEL_ADJUNTO_BYTES;
      const enlace = conEnlace
        ? await this.almacen.urlFirmada(r.ruta, VIDA_DEL_ENLACE_DEL_CORREO_S)
        : null;
      const resultado = await this.correo.enviar({
        destinatarios: pendientes.map((d) => d.correo),
        asunto: asuntoDelRespaldo(r, copropiedad),
        cuerpo: cuerpoDelRespaldo(r, copropiedad, enlace),
        adjuntos: conEnlace
          ? []
          : [{ nombre: `eventos-${r.fecha}.xls`, tipoMime: 'application/vnd.ms-excel', contenido }],
      });
      if (resultado.estado === 'enviado') {
        return {
          intento: { resultado: 'enviado', error: null, enviadoEn: this.reloj.ahora(), conEnlace },
          rechazados: new Set(resultado.rechazados.map((d) => d.toLowerCase())),
        };
      }
      if (resultado.estado === 'sin-configurar') {
        return sinRechazos({
          resultado: 'sin_configurar',
          error: null,
          enviadoEn: null,
          conEnlace,
        });
      }
      return sinRechazos(fallo(resultado.detalle, conEnlace));
    } catch (error) {
      return sinRechazos(fallo(error instanceof Error ? error.message : String(error)));
    }
  }
}
