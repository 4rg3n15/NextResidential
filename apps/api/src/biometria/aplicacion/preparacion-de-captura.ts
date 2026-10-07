import {
  CalidadDeCaptura,
  ConsentimientoBiometrico,
  PlantillaBiometrica,
  errorDominio,
  esFallo,
  evaluarCaptura,
  exito,
  fallo,
} from '@ncr/domain-core';
import type {
  CanalConsentimiento,
  ErrorDominio,
  EvaluacionDeCaptura,
  GeneradorDeId,
  MedidasDeCaptura,
  MotivoRechazoCaptura,
  Reloj,
  Resultado,
  UmbralesDeCalidad,
} from '@ncr/domain-core';
import type { RepositorioConsentimientos } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE UNA CAPTURA PREPARA ANTES DE GUARDAR NADA · salió de `CapturarRostro`
 *
 * 15-X · D2 · el rostro del residente necesita la MISMA preparación que el de
 * una visita —calidad, consentimiento, plantilla— pero guardada de otra forma:
 * en una transacción que reemplaza su rostro anterior. Para no duplicarla, la
 * preparación vive aquí y la usan los dos: `CapturarRostro` y `MiRostro`.
 *
 * El orden sigue siendo la regla: calidad → consentimiento → plantilla.
 *
 * Cuatro constancias del consentimiento, y no se confunden (ADR-032, ADR-039):
 *  · sin nada: una SOLICITUD pendiente del titular (CU-02, lo de siempre);
 *  · `declaracion`: la casilla de quien registra la visita (F4, 15-L);
 *  · `otorgadoPorElTitular` (15-X · D2): el propio titular acepta la política
 *    en el acto, desde su cuenta. Si ya tiene uno vigente se reutiliza —la base
 *    admite uno solo, `consent_vigente_uk`—, y si aquel lo había declarado
 *    quien registró una visita, o lo autorizó su representante cuando era
 *    menor, el titular lo confirma (D-10); si no hay ninguno, se solicita y él
 *    mismo lo otorga;
 *  · `representante` (15-X · D3): el titular del hogar autoriza el rostro de un
 *    menor. Se reutiliza sólo la autorización vigente de ESE representante; con
 *    otra vigente no se registra (409): si es de otro representante, se retira
 *    primero; si es del menor o de una visita, sólo la revoca el menor.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface SolicitudDeCaptura {
  readonly titularId: string;
  readonly autorizacionId?: string;
  /** Las medidas de ESTA captura. Obligatorias salvo con `calidadPrevia`. */
  readonly medidas?: MedidasDeCaptura;
  /**
   * F6 (15-L) · «Volver a autorizar» reutiliza una foto que YA se evaluó: su
   * calidad es la que se midió entonces y quedó en la plantilla original. No
   * se inventan medidas nuevas para una foto que nadie volvió a tomar.
   */
  readonly calidadPrevia?: number;
  readonly vector: Uint8Array;
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  readonly suprimirEn: Date;
  /**
   * F4 (15-L, ADR-032) · la casilla del formulario: quien registra declara que
   * el visitante autorizó el uso de su foto.
   */
  readonly declaracion?: { readonly declaradoPor: string };
  /** 15-X · D2 · el titular acepta la política él mismo, desde su cuenta. */
  readonly otorgadoPorElTitular?: true;
  /**
   * 15-X · D3 · el titular del hogar autoriza, como REPRESENTANTE LEGAL, el
   * rostro de un menor de 15 a 17 años: su cuenta queda como autora.
   */
  readonly representante?: { readonly representanteId: string };
}

export type CapturaPreparada =
  | {
      readonly aceptada: true;
      readonly consentimiento: ConsentimientoBiometrico;
      readonly plantilla: PlantillaBiometrica;
      readonly calidad: number;
    }
  | { readonly aceptada: false; readonly motivos: readonly MotivoRechazoCaptura[] };

export class PreparacionDeCaptura {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeId,
    private readonly umbrales?: UmbralesDeCalidad,
  ) {}

  async preparar(
    copropiedadId: string,
    solicitud: SolicitudDeCaptura,
  ): Promise<Resultado<CapturaPreparada, ErrorDominio>> {
    const evaluacion = this.evaluar(solicitud);
    if (esFallo(evaluacion)) return evaluacion;
    if (!evaluacion.valor.aceptada) {
      return exito({ aceptada: false, motivos: evaluacion.valor.motivos });
    }

    const ahora = this.reloj.ahora();
    const consentimiento = await this.consentimientoPara(copropiedadId, solicitud, ahora);
    if (esFallo(consentimiento)) return consentimiento;

    const creada = PlantillaBiometrica.crear({
      id: this.ids.nuevo(),
      copropiedadId,
      titularId: solicitud.titularId,
      consentimientoId: consentimiento.valor.id,
      ...(solicitud.autorizacionId === undefined
        ? {}
        : { autorizacionId: solicitud.autorizacionId }),
      calidad: evaluacion.valor.calidad,
      creadoEn: ahora,
      suprimirEn: solicitud.suprimirEn,
    });
    if (esFallo(creada)) return creada;
    // Con el consentimiento ya vigente (declarado, otorgado o previo), la
    // plantilla nace habilitada: el agregado comprueba que sea de este titular.
    const plantilla = consentimiento.valor.vigente
      ? creada.valor.habilitarSincronizacion(consentimiento.valor)
      : creada;
    if (esFallo(plantilla)) return plantilla;
    return exito({
      aceptada: true,
      consentimiento: consentimiento.valor,
      plantilla: plantilla.valor,
      calidad: evaluacion.valor.calidad.valor,
    });
  }

  /** Las medidas de esta captura, o la calidad ya medida de la foto que se reutiliza. */
  private evaluar(solicitud: SolicitudDeCaptura): Resultado<EvaluacionDeCaptura, ErrorDominio> {
    if (solicitud.calidadPrevia !== undefined) {
      const calidad = CalidadDeCaptura.crear(solicitud.calidadPrevia);
      if (esFallo(calidad)) return calidad;
      return exito({ aceptada: true, calidad: calidad.valor });
    }
    if (solicitud.medidas === undefined) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'Faltan las medidas de calidad de la foto', 'KPI-16'),
      );
    }
    return exito(
      this.umbrales === undefined
        ? evaluarCaptura(solicitud.medidas)
        : evaluarCaptura(solicitud.medidas, this.umbrales),
    );
  }

  private async consentimientoPara(
    copropiedadId: string,
    solicitud: SolicitudDeCaptura,
    ahora: Date,
  ): Promise<Resultado<ConsentimientoBiometrico, ErrorDominio>> {
    const base = {
      id: this.ids.nuevo(),
      copropiedadId,
      titularId: solicitud.titularId,
      finalidad: 'control_acceso',
      versionPolitica: solicitud.versionPolitica,
      canal: solicitud.canal,
    };
    const constancia =
      solicitud.declaracion ?? solicitud.otorgadoPorElTitular ?? solicitud.representante;
    if (constancia === undefined) {
      return ConsentimientoBiometrico.solicitar({ ...base, solicitadoEn: ahora });
    }
    const vigente = await this.consentimientos.vigenteDe(copropiedadId, solicitud.titularId);
    if (solicitud.representante !== undefined) {
      const { representanteId } = solicitud.representante;
      return vigente === null
        ? ConsentimientoBiometrico.autorizarComoRepresentanteLegal({
            ...base,
            representanteId,
            ahora,
          })
        : reutilizableDelRepresentante(vigente, representanteId);
    }
    if (solicitud.otorgadoPorElTitular === true) {
      if (vigente !== null) {
        return vigente.origen === 'otorgado_por_el_titular'
          ? exito(vigente)
          : vigente.confirmarPorElTitular(solicitud.titularId, ahora);
      }
      const solicitado = ConsentimientoBiometrico.solicitar({ ...base, solicitadoEn: ahora });
      return esFallo(solicitado)
        ? solicitado
        : solicitado.valor.otorgar(solicitud.titularId, ahora);
    }
    if (vigente !== null) return exito(vigente);
    return ConsentimientoBiometrico.declarar({
      ...base,
      declaradoPor: solicitud.declaracion?.declaradoPor ?? '',
      ahora,
    });
  }
}

/** D3 · sólo la autorización vigente de ESE representante; otra vigente es un 409. */
const reutilizableDelRepresentante = (
  vigente: ConsentimientoBiometrico,
  representanteId: string,
): Resultado<ConsentimientoBiometrico, ErrorDominio> => {
  if (vigente.origen !== 'autorizado_por_representante_legal') {
    return fallo(
      errorDominio(
        'INVARIANTE_VIOLADA',
        'Este menor tiene otro consentimiento vigente, de una visita o suyo: mientras siga ' +
          'vigente, su representante no registra uno nuevo',
        'RN-10',
      ),
    );
  }
  if (vigente.declaradoPor !== representanteId) {
    return fallo(
      errorDominio(
        'INVARIANTE_VIOLADA',
        'El rostro de este menor lo autorizó otro representante: retírelo y vuelva a registrarlo',
        'RN-10',
      ),
    );
  }
  return exito(vigente);
};
