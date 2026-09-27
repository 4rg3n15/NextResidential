import { errorDominio, esFallo, evaluarCaptura, exito, fallo } from '@ncr/domain-core';
import type {
  CanalConsentimiento,
  ErrorDominio,
  MedidasDeCaptura,
  MotivoRechazoCaptura,
  Reloj,
  Resultado,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { AdjuntarFotografiaDeVisitante } from '../../autorizaciones';
import type {
  CapturarRostro,
  ResultadoDeSincronizacionTotal,
  SincronizarPlantillaEnTerminales,
} from '../../biometria';
import { MAX_BASE64_FOTOGRAFIA, TIPOS_DE_IMAGEN_ADMITIDOS, tipoRealDe } from './foto';
import type { ConstanciaDeCasilla } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA CASILLA · F4 (15-L) · ADR-032
 *
 * El texto que ve quien registra y la versión que queda escrita con cada
 * autorización. La versión la pone el SERVIDOR, no el cliente: el cliente sólo
 * dice que la casilla se marcó; qué texto se marcó lo sabe quien lo publica.
 * Si el texto cambia, cambia la versión.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const TEXTO_DE_LA_CASILLA = 'El visitante autorizó el uso de su foto para el ingreso';
export const VERSION_DE_LA_CASILLA = 'casilla-2026-09-27';

export interface FotoDeVisita {
  readonly contenidoBase64: string;
  readonly tipoMime: string;
  /** Las medidas de la foto recién tomada… */
  readonly medidas?: MedidasDeCaptura;
  /** …o, al volver a autorizar (F6), la calidad que se midió al tomarla. */
  readonly calidadPrevia?: number;
}

/**
 * Lo que se comprueba de la foto ANTES de crear nada: tipo real, tamaño y
 * calidad (KPI-16). Una autorización que nace y se anula porque la foto no
 * servía ensucia el historial de la vivienda con visitas que nunca existieron.
 */
export const revisarFoto = (
  foto: FotoDeVisita,
): Resultado<
  | { readonly aceptada: true }
  | { readonly aceptada: false; readonly motivos: readonly MotivoRechazoCaptura[] },
  ErrorDominio
> => {
  if (!TIPOS_DE_IMAGEN_ADMITIDOS.includes(foto.tipoMime)) {
    return fallo(errorDominio('DATO_INVALIDO', 'La foto debe ser JPEG o PNG'));
  }
  if (foto.contenidoBase64.length > MAX_BASE64_FOTOGRAFIA) {
    return fallo(errorDominio('DATO_INVALIDO', 'La foto supera 1,5 MiB'));
  }
  const bytes = Buffer.from(foto.contenidoBase64, 'base64');
  if (bytes.length === 0 || tipoRealDe(bytes) !== foto.tipoMime) {
    return fallo(errorDominio('DATO_INVALIDO', 'El archivo no es la imagen que dice ser'));
  }
  if (foto.calidadPrevia !== undefined) return exito({ aceptada: true });
  if (foto.medidas === undefined) {
    return fallo(errorDominio('DATO_INVALIDO', 'Faltan las medidas de calidad de la foto'));
  }
  const evaluacion = evaluarCaptura(foto.medidas);
  return exito(
    evaluacion.aceptada ? { aceptada: true } : { aceptada: false, motivos: evaluacion.motivos },
  );
};

export interface EntradaDeRostroDeVisita {
  readonly autorizacionId: string;
  /** La persona de la autorización: el TITULAR del dato. */
  readonly titularId: string;
  /** Fin de la visita: la plantilla no vive más que ella (RN-11). */
  readonly hasta: Date;
  readonly foto: FotoDeVisita;
}

export interface RostroRegistrado {
  readonly plantillaId: string;
  readonly consentimientoId: string;
  readonly sincronizacion: ResultadoDeSincronizacionTotal | null;
  /** Por qué no se intentó o no se pudo sincronizar, si fue así. */
  readonly avisoDeSincronizacion: string | null;
}

/** Cómo se pidió: desde la app del residente, o en la consola frente a la persona. */
const canalDe = (ctx: ContextoTenant): CanalConsentimiento =>
  ctx.rol === 'residente' ? 'app' : 'presencial';

/**
 * `RegistrarRostroDeVisita` — F1, F3, F4 (15-L).
 *
 * La segunda mitad de «Generar autorización», la MISMA para la consola y la
 * app: con la autorización ya creada, guarda la foto como evidencia privada
 * (RN-21), deja la constancia de la casilla, genera la plantilla con el
 * consentimiento declarado y la envía a TODOS los equipos de la copropiedad
 * que admiten rostros (A2/A3). Que un equipo no la acepte no deshace nada: se
 * anota por equipo y la consola la reintenta.
 */
export class RegistrarRostroDeVisita {
  constructor(
    private readonly adjuntar: AdjuntarFotografiaDeVisitante,
    private readonly capturar: CapturarRostro,
    private readonly enTerminales: SincronizarPlantillaEnTerminales,
    private readonly casillas: ConstanciaDeCasilla,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaDeRostroDeVisita,
  ): Promise<Resultado<RostroRegistrado, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'Sin copropiedad', 'RN-15'));
    }

    const adjuntada = await this.adjuntar.ejecutar(ctx, entrada.autorizacionId, {
      contenidoBase64: entrada.foto.contenidoBase64,
      tipoMime: entrada.foto.tipoMime,
    });
    if (esFallo(adjuntada)) return adjuntada;

    await this.casillas.anotar(copropiedadId, entrada.autorizacionId, {
      declaradoPor: ctx.usuarioId,
      en: this.reloj.ahora(),
      version: VERSION_DE_LA_CASILLA,
    });

    const capturada = await this.capturar.ejecutar(ctx, {
      titularId: entrada.titularId,
      autorizacionId: entrada.autorizacionId,
      ...(entrada.foto.medidas === undefined ? {} : { medidas: entrada.foto.medidas }),
      ...(entrada.foto.calidadPrevia === undefined
        ? {}
        : { calidadPrevia: entrada.foto.calidadPrevia }),
      vector: new Uint8Array(Buffer.from(entrada.foto.contenidoBase64, 'base64')),
      versionPolitica: VERSION_DE_LA_CASILLA,
      canal: canalDe(ctx),
      suprimirEn: entrada.hasta,
      declaracion: { declaradoPor: ctx.usuarioId },
    });
    if (esFallo(capturada)) return capturada;
    if (!capturada.valor.aceptada) {
      return fallo(errorDominio('DATO_INVALIDO', 'La foto no cumple la calidad mínima', 'KPI-16'));
    }

    const { plantillaId, consentimientoId } = capturada.valor;
    const enviada = await this.enTerminales.ejecutar(ctx, { plantillaId });
    return exito({
      plantillaId,
      consentimientoId,
      sincronizacion: esFallo(enviada) ? null : enviada.valor,
      avisoDeSincronizacion: esFallo(enviada) ? enviada.error.detalle : null,
    });
  }
}
