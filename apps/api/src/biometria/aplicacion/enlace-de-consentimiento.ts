import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ConsentimientoBiometrico, ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { EstadoConsentimiento } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { DatosDelEnlace, FirmanteDeEnlaces, RepositorioConsentimientos } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ENLACE DEL TITULAR · A3, ETAPA 15-E · RN-10
 *
 * El visitante no tiene sesión. Lo que tiene es el enlace que le entrega quien
 * capturó su rostro —el residente desde la app, el portero desde la consola—
 * y con ese enlace, en su propio teléfono, acepta, rechaza o revoca. Es la
 * forma en que «lo responde el titular, por su canal» deja de ser una frase y
 * pasa a ser una pantalla.
 *
 * Quién lo emite NO cambia quién responde: el enlace lleva al titular dentro,
 * firmado, y el agregado sigue verificando `quienAcepta === titularId`. Un
 * portero que se lo guarde y lo abra él mismo está actuando como titular, que
 * es exactamente lo que RN-10 prohíbe y lo que ninguna técnica impide: por
 * eso el canal de entrega es una decisión de Grupo Control ([SUPUESTO] S-43)
 * y por eso todo queda en bitácora con el actor que lo emitió.
 */
export interface EnlaceEmitido {
  readonly consentimientoId: string;
  readonly estado: EstadoConsentimiento;
  readonly token: string;
  /** La ruta en la API, siempre. */
  readonly ruta: string;
  /** La URL completa si `API_URL_PUBLICA` está declarada; si no, `null` y se dice. */
  readonly url: string | null;
  readonly expiraEn: Date;
}

const RUTA_PUBLICA = '/consentimiento';

export class EmitirEnlaceDeConsentimiento {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly firmante: FirmanteDeEnlaces,
    private readonly reloj: Reloj,
    private readonly opciones: {
      readonly plazoHoras: number;
      readonly urlPublica: string | null;
    },
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: { readonly consentimientoId: string },
  ): Promise<Resultado<EnlaceEmitido, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La copropiedad no existe', 'RN-15'));
    }
    const c = await this.consentimientos.porId(copropiedadId, entrada.consentimientoId);
    if (c === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'El consentimiento no existe', 'RN-15'));
    }
    // Un consentimiento cerrado —rechazado, revocado, expirado— no admite más
    // respuesta: emitir un enlace sería invitar a responder lo que ya no existe.
    if (c.estado !== 'pendiente' && c.estado !== 'vigente') {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          `Un consentimiento ${c.estado} ya no admite respuesta del titular`,
          'RN-09',
        ),
      );
    }

    const ahora = this.reloj.ahora();
    const expiraEn = new Date(ahora.getTime() + this.opciones.plazoHoras * 3_600_000);
    const token = this.firmante.firmar({
      copropiedadId,
      consentimientoId: c.id,
      titularId: c.titularId,
      expiraEn,
      estadoAlEmitir: c.estado,
    });
    const ruta = `${RUTA_PUBLICA}/${token}`;
    const base = this.opciones.urlPublica?.replace(/\/+$/, '') ?? null;
    return exito({
      consentimientoId: c.id,
      estado: c.estado,
      token,
      ruta,
      url: base === null ? null : `${base}${ruta}`,
      expiraEn,
    });
  }
}

/** Lo que la página pública sabe de un enlace válido: sus datos y su consentimiento. */
export interface EnlaceResuelto {
  readonly datos: DatosDelEnlace;
  readonly consentimiento: ConsentimientoBiometrico;
  /**
   * `true` si el enlace es auténtico pero YA SE USÓ: el consentimiento cambió
   * de estado después de emitirlo. Se puede mostrar el estado; no se puede
   * actuar con él.
   */
  readonly gastado: boolean;
}

export class ResolverEnlaceDeConsentimiento {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly firmante: FirmanteDeEnlaces,
    private readonly reloj: Reloj,
  ) {}

  /**
   * `null` en todo caso dudoso: firma, caducidad, consentimiento ausente o de
   * otro titular. Un enlace auténtico YA USADO —el consentimiento cambió de
   * estado después de emitirlo— vuelve con `gastado: true`: vale para MOSTRAR
   * lo que el titular decidió, no para actuar. Un enlace vale para responder
   * mientras el consentimiento siga pendiente, y para revocar sólo si se emitió
   * después de otorgarlo.
   */
  async ejecutar(token: string): Promise<EnlaceResuelto | null> {
    const datos = this.firmante.verificar(token, this.reloj.ahora());
    if (datos === null) return null;
    const consentimiento = await this.consentimientos.porId(
      datos.copropiedadId,
      datos.consentimientoId,
    );
    if (consentimiento === null || consentimiento.titularId !== datos.titularId) return null;
    return { datos, consentimiento, gastado: !enlaceVigente(datos, consentimiento) };
  }
}

/** Puro: la regla de un solo uso, para la prueba y para el resolutor. */
export const enlaceVigente = (
  datos: Pick<DatosDelEnlace, 'estadoAlEmitir'>,
  c: Pick<ConsentimientoBiometrico, 'estado'>,
): boolean =>
  c.estado === datos.estadoAlEmitir && (c.estado === 'pendiente' || c.estado === 'vigente');
