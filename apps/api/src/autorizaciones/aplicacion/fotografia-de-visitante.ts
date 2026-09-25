import { createHash } from 'node:crypto';
import type {
  AlmacenEvidencia,
  ErrorDominio,
  GeneradorDeId,
  Reloj,
  Resultado,
} from '@ncr/domain-core';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { TIPOS_DE_IMAGEN_ADMITIDOS, extensionDe, tipoRealDe } from '../../comun/archivos/tipo-real';
import { CasoDeUsoDeAutorizaciones } from './casos-de-uso';
import type { RepositorioAutorizaciones } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA FOTOGRAFÍA DEL VISITANTE — ETAPA 15-D (O3, ADR-021)
 *
 * Lo que es: una imagen de IDENTIFICACIÓN que el portero mira para confrontar
 * con quien tiene delante. Lo que NO es: un dato biométrico. No se genera
 * plantilla, no se sincroniza con ninguna terminal, ningún algoritmo la compara.
 * Por eso no pasa por el módulo de biometría ni exige consentimiento de
 * plantilla (RN-09): sigue el camino de la evidencia (RN-21) —bucket privado,
 * referencia en base, URL firmada de vida corta— y la Ley 1581 la alcanza como
 * dato personal ordinario, con la finalidad declarada de control de acceso.
 * Los dos caminos NO se mezclan: si algún día se quisiera reconocer al
 * visitante por el rostro, sería CU-02 entero, con su consentimiento.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES DEFENSAS, TODAS AQUÍ Y NO EN EL FORMULARIO
 *
 * 1. Tamaño acotado ANTES de decodificar: una cadena base64 de cien megabytes
 *    no se convierte en bytes para descubrir que sobra.
 * 2. Tipo REAL por los bytes de cabecera, y coincidencia con el declarado:
 *    un PNG que dice ser JPEG es una señal, no un detalle que se corrige.
 * 3. Lo que se guarda en la base es la REFERENCIA (clave, hash, tamaño), y lo
 *    que sale al cliente es una URL firmada que caduca. Nunca la ruta del
 *    bucket como dato permanente en una respuesta.
 */
export const MAX_BYTES_FOTOGRAFIA = 1_572_864; // 1,5 MiB decodificados
/** Longitud máxima de la cadena base64 que representa `MAX_BYTES_FOTOGRAFIA`. */
export const MAX_BASE64_FOTOGRAFIA = Math.ceil(MAX_BYTES_FOTOGRAFIA / 3) * 4;
export const SEGUNDOS_URL_FOTOGRAFIA = 120;

export interface EntradaFotografiaDeVisitante {
  readonly contenidoBase64: string;
  readonly tipoMime: string;
}

export interface FotografiaAdjuntada {
  readonly tipoMime: string;
  readonly tamanoBytes: number;
}

export class AdjuntarFotografiaDeVisitante extends CasoDeUsoDeAutorizaciones {
  constructor(
    repo: RepositorioAutorizaciones,
    reloj: Reloj,
    private readonly almacen: AlmacenEvidencia,
    private readonly ids: GeneradorDeId,
  ) {
    super(repo, reloj);
  }

  async ejecutar(
    ctx: ContextoTenant,
    autorizacionId: string,
    entrada: EntradaFotografiaDeVisitante,
  ): Promise<Resultado<FotografiaAdjuntada, ErrorDominio>> {
    const copropiedad = this.copropiedadDe(ctx);
    if (!copropiedad.ok) return copropiedad;

    if (!TIPOS_DE_IMAGEN_ADMITIDOS.includes(entrada.tipoMime)) {
      return fallo(errorDominio('DATO_INVALIDO', 'La fotografía debe ser JPEG o PNG'));
    }
    if (entrada.contenidoBase64.length > MAX_BASE64_FOTOGRAFIA) {
      return fallo(errorDominio('DATO_INVALIDO', 'La fotografía supera 1,5 MiB'));
    }
    const bytes = Buffer.from(entrada.contenidoBase64, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_BYTES_FOTOGRAFIA) {
      return fallo(errorDominio('DATO_INVALIDO', 'La fotografía está vacía o supera 1,5 MiB'));
    }
    const real = tipoRealDe(bytes);
    if (real === null) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          'El contenido no es JPEG ni PNG según sus bytes de cabecera (§2.7.8: tipo real, no extensión)',
        ),
      );
    }
    if (real !== entrada.tipoMime) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          `El tipo declarado (${entrada.tipoMime}) no coincide con el real`,
        ),
      );
    }

    const autorizacion = await this.repo.porId(copropiedad.valor, autorizacionId);
    if (autorizacion === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La autorización no existe'));
    }
    if (autorizacion.estado === 'revocada') {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'La autorización está revocada'));
    }

    // La clave lleva copropiedad y autorización: el objeto queda bajo el tenant
    // en el propio bucket, y un identificador nuevo por carga impide que una
    // segunda fotografía sobrescriba la que ya sustentó una confrontación.
    const clave = `visitantes/${copropiedad.valor}/${autorizacionId}/${this.ids.nuevo()}.${extensionDe(real)}`;
    await this.almacen.guardar(clave, bytes, real);
    const enlazada = await this.repo.adjuntarFotografia(
      copropiedad.valor,
      autorizacionId,
      {
        clave,
        tipoMime: real,
        hashSha256: createHash('sha256').update(bytes).digest('hex'),
        tamanoBytes: bytes.length,
      },
      ctx.usuarioId,
    );
    if (!enlazada) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La autorización no existe'));
    }
    return exito({ tipoMime: real, tamanoBytes: bytes.length });
  }
}

export interface UrlDeFotografia {
  readonly url: string;
  readonly expiraEnSegundos: number;
}

/** La URL firmada, generada en cada lectura y nunca guardada (RN-21, D-19). */
export class UrlDeFotografiaDeVisitante extends CasoDeUsoDeAutorizaciones {
  constructor(
    repo: RepositorioAutorizaciones,
    reloj: Reloj,
    private readonly almacen: AlmacenEvidencia,
  ) {
    super(repo, reloj);
  }

  async ejecutar(
    ctx: ContextoTenant,
    autorizacionId: string,
  ): Promise<Resultado<UrlDeFotografia, ErrorDominio>> {
    const copropiedad = this.copropiedadDe(ctx);
    if (!copropiedad.ok) return copropiedad;

    const fotografia = await this.repo.fotografiaDe(copropiedad.valor, autorizacionId);
    if (fotografia === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La autorización no tiene fotografía'));
    }
    return exito({
      url: await this.almacen.urlFirmada(fotografia.clave, SEGUNDOS_URL_FOTOGRAFIA),
      expiraEnSegundos: SEGUNDOS_URL_FOTOGRAFIA,
    });
  }
}
