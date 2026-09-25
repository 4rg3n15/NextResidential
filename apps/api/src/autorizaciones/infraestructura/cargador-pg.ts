import { Autorizacion, Placa, Vigencia, esExito } from '@ncr/domain-core';
import type { Bitacora, ContextoDeAcceso } from '@ncr/domain-core';
import type {
  CargadorDeContexto,
  LectorDeConsentimientoBiometrico,
  LectorDeUmbralDeConfianza,
  PlacaResuelta,
  RepositorioAutorizaciones,
  RepositorioListaNegra,
  RepositorioVersionDeReglas,
  ResolutorDePlaca,
  ResolutorDeZona,
  SolicitudDeAcceso,
} from '../aplicacion/puertos';
import { UMBRAL_CONFIANZA_PLACA_FRACCION } from '../../multiempresa/configuracion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CARGADOR QUE FALTABA · D-25, ETAPA 15-D
 *
 * Hasta aquí el motor recibía un contexto vacío y negaba TODA lectura con
 * `FALLO_TECNICO`: las autorizaciones que la consola escribía no llegaban a la
 * decisión. El camino de escritura era correcto; el de lectura no existía.
 *
 * Este cargador reúne, con I/O y por PUERTOS, todo lo que el motor necesita y
 * se lo entrega cerrado. El motor sigue puro: no consulta nada.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DE DÓNDE SALE CADA COSA, Y CUÁNTO CUESTA
 *
 *   placa → vivienda           ResolutorDePlaca        (padrón)        1 consulta
 *   autorizaciones activas     RepositorioAutorizaciones                1 consulta
 *   vetos vigentes             RepositorioListaNegra                    1 consulta
 *   zona (sólo si se nombra)   ResolutorDeZona          (zonas)         0 ó 1
 *   umbral de la copropiedad   LectorDeUmbralDeConfianza                1 consulta
 *
 * Una consulta por AGREGADO, nunca una por política ni una por autorización:
 * el repositorio rehidrata acompañantes, zonas y patrón en la misma sentencia.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL DERECHO DEL RESIDENTE ES UNA AUTORIZACIÓN, Y SE MODELA COMO TAL
 *
 * El motor razona sobre `Autorizacion`: quién puede entrar, a qué vivienda, en
 * qué vigencia. Un vehículo del padrón no tiene fila en `autorizaciones` —el
 * residente no se autoriza a sí mismo—, pero su derecho a entrar existe y rige
 * mientras su vivienda esté en servicio. Se le entrega al motor como una
 * autorización SINTÉTICA: vigente desde que el vehículo se registró y hasta que
 * la vivienda se dio de baja (RN-13: una vivienda inactiva no genera accesos
 * nuevos). Así el motor aplica las mismas reglas a todos, y una vivienda de
 * baja se niega por `politica.vigencia` y no por un fallo técnico.
 *
 * [SUPUESTO] S-33 · el contrato no tiene motivo «VIVIENDA_INACTIVA». Se usa
 * VIGENCIA_EXPIRADA con la regla `politica.vigencia`, que es literalmente lo
 * que ocurrió: el derecho venció con la baja. Si Grupo Control quiere
 * distinguirlo, es una extensión al contrato (como E-01) y no se inventa aquí.
 */

/** Cien años: «mientras la vivienda esté en servicio», sin fecha de caducidad. */
const SIN_CADUCIDAD_MS = 100 * 365 * 24 * 3600 * 1000;

export class CargadorDeContextoPg implements CargadorDeContexto {
  constructor(
    private readonly versiones: RepositorioVersionDeReglas,
    private readonly autorizaciones: RepositorioAutorizaciones,
    private readonly placas: ResolutorDePlaca,
    private readonly listaNegra: RepositorioListaNegra,
    private readonly umbrales: LectorDeUmbralDeConfianza,
    private readonly bitacora: Bitacora,
    private readonly zonas?: ResolutorDeZona,
    /**
     * A2 · quien dice si hay consentimiento biométrico vigente. Opcional a
     * propósito: sin él, el cargador sigue siendo CONSERVADOR (`false`), que
     * es exactamente lo que S-34 dejaba y lo que la suite sin biometría espera.
     */
    private readonly consentimientos?: LectorDeConsentimientoBiometrico,
  ) {}

  async cargar(solicitud: SolicitudDeAcceso, ahora: Date): Promise<ContextoDeAcceso> {
    const placa = this.placaNormalizada(solicitud.placaLeida);
    const [vehiculo, veto, umbral, version] = await Promise.all([
      placa === null ? Promise.resolve(null) : this.placas.resolver(solicitud.copropiedadId, placa),
      this.vetos(solicitud.copropiedadId),
      this.umbral(solicitud.copropiedadId),
      this.versiones.vigenteDe(solicitud.copropiedadId),
    ]);

    const personaId = solicitud.personaId ?? vehiculo?.personaId ?? null;
    const consentimientoVigente = await this.consentimiento(solicitud, personaId, ahora);
    const autorizaciones = await this.autorizaciones.activasParaLectura(solicitud.copropiedadId, {
      placa,
      personaId,
    });
    const sintetica = vehiculo === null ? null : this.derechoDelResidente(solicitud, vehiculo);

    // La vivienda de destino: la del vehículo del padrón, o la de la
    // autorización de visitante que trae esa placa. En ese orden, porque el
    // vehículo registrado es el hecho más fuerte que hay.
    const viviendaId = vehiculo?.viviendaId ?? autorizaciones[0]?.viviendaId ?? null;

    return {
      ahora,
      copropiedadId: solicitud.copropiedadId,
      versionDeReglas: version,
      personaId,
      viviendaId,
      metodo: solicitud.metodo,
      autorizaciones: sintetica === null ? autorizaciones : [sintetica, ...autorizaciones],
      personasEnListaNegra: veto.personas,
      placasEnListaNegra: veto.placas,
      placaLeida: placa,
      // Conocida = del padrón, o con una autorización de visitante (aunque
      // esté vencida: eso lo decide el motor con otro motivo).
      placaConocida: placa !== null && (vehiculo !== null || autorizaciones.length > 0),
      viviendaActiva: vehiculo?.viviendaActiva ?? autorizaciones.length > 0,
      zona: await this.zona(solicitud, ahora),
      confianza: solicitud.confianza,
      umbralDeConfianza: umbral,
      consentimientoVigente,
    };
  }

  /**
   * S-34, cerrado en la 15-E · el consentimiento SÓLO se consulta en un acceso
   * facial con persona identificada. Para la placa no aplica y el motor no lo
   * mira; y ante un fallo del lector se registra y queda en `false`: negar por
   * SIN_CONSENTIMIENTO es la dirección segura de RN-09.
   */
  private async consentimiento(
    solicitud: SolicitudDeAcceso,
    personaId: string | null,
    ahora: Date,
  ): Promise<boolean> {
    if (solicitud.metodo !== 'facial' || personaId === null || this.consentimientos === undefined) {
      return false;
    }
    try {
      return await this.consentimientos.consentimientoVigente(
        solicitud.copropiedadId,
        personaId,
        ahora,
      );
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo leer el consentimiento biométrico', {
        copropiedadId: solicitud.copropiedadId,
        personaId,
        error: error instanceof Error ? error.message : String(error),
        motivo: 'RN-09 · sin lectura no hay consentimiento: el motor negará',
      });
      return false;
    }
  }

  /**
   * El objeto de valor decide qué es una placa; aquí no se normaliza a mano.
   * Una lectura que no forma placa se entrega tal cual: el motor la tratará
   * como desconocida, que es lo que es.
   */
  private placaNormalizada(leida: string | null): string | null {
    if (leida === null || leida.trim() === '') return null;
    const placa = Placa.crear(leida);
    return esExito(placa) ? placa.valor.valor : leida.trim().toUpperCase();
  }

  private derechoDelResidente(
    solicitud: SolicitudDeAcceso,
    vehiculo: PlacaResuelta,
  ): Autorizacion | null {
    const desde = vehiculo.registradoEn;
    const hasta =
      vehiculo.viviendaActiva || vehiculo.viviendaDesactivadaEn === null
        ? new Date(desde.getTime() + SIN_CADUCIDAD_MS)
        : vehiculo.viviendaDesactivadaEn;
    const vigencia = Vigencia.crear(desde, hasta);
    if (!esExito(vigencia)) return null;
    const derecho = Autorizacion.crear({
      id: `residente:${vehiculo.vehiculoId}`,
      copropiedadId: solicitud.copropiedadId,
      viviendaId: vehiculo.viviendaId,
      personaId: vehiculo.personaId ?? `vehiculo:${vehiculo.vehiculoId}`,
      vigencia: vigencia.valor,
    });
    return esExito(derecho) ? derecho.valor : null;
  }

  private async umbral(copropiedadId: string): Promise<number> {
    try {
      return (
        (await this.umbrales.umbralDeConfianzaPlaca(copropiedadId)) ??
        UMBRAL_CONFIANZA_PLACA_FRACCION
      );
    } catch (error) {
      this.bitacora.registrar(
        'aviso',
        'no se pudo leer el umbral de la copropiedad: se usa el del contrato',
        {
          copropiedadId,
          umbral: UMBRAL_CONFIANZA_PLACA_FRACCION,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return UMBRAL_CONFIANZA_PLACA_FRACCION;
    }
  }

  /**
   * RN-06 · precedencia absoluta. Un fallo al leer la lista negra NO abre la
   * puerta, y tampoco se disimula: se registra y se deja al motor con lo que
   * sí se pudo cargar. Sin vetos leídos, el conjunto vacío es lo honesto; lo
   * que impide el paso en ese caso es que el resto del contexto también se
   * cargó de verdad y las demás políticas siguen aplicando.
   */
  private async vetos(
    copropiedadId: string,
  ): Promise<{ personas: Set<string>; placas: Set<string> }> {
    try {
      const entradas = await this.listaNegra.activasDe(copropiedadId);
      return {
        personas: new Set(entradas.map((e) => e.personaId).filter((p): p is string => p !== null)),
        placas: new Set(entradas.map((e) => e.placa).filter((p): p is string => p !== null)),
      };
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo leer la lista negra', {
        copropiedadId,
        error: error instanceof Error ? error.message : String(error),
        motivo: 'RN-06 · precedencia absoluta; el motor decide con el resto del contexto',
      });
      return { personas: new Set<string>(), placas: new Set<string>() };
    }
  }

  private async zona(solicitud: SolicitudDeAcceso, ahora: Date): Promise<ContextoDeAcceso['zona']> {
    if (solicitud.zonaId === null || this.zonas === undefined) return null;
    return this.zonas.resolver(solicitud.copropiedadId, solicitud.zonaId, ahora);
  }
}
