/**
 * El Edge Gateway como máquina: qué hace con un hecho y qué hace con un tic.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS ENTRADAS Y NINGÚN TEMPORIZADOR DENTRO
 *
 * `alRecibirHecho(hecho)` y `tic(ahora)`. Quien los llama es `main.ts` —un
 * `setInterval` y un servidor HTTP— y aquí no hay ni uno ni otro. Esa frontera
 * es lo que permite que las pruebas de la DoD existan: los 30 minutos sin WAN
 * se recorren llamando a `tic` con instantes fabricados, y las 24 horas de
 * KPI-30 en un bucle de segundos. Con un `setInterval` dentro, esas pruebas
 * durarían media hora y un día.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ORDEN DE `alRecibirHecho` NO ES NEGOCIABLE
 *
 *   1. decidir     · el hardware espera una respuesta, y la espera ya
 *   2. encolar     · antes de intentar nada por red
 *   3. responder   · la puerta se abre o no
 *
 * Encolar ANTES de intentar el envío es lo mismo que hace la bandeja de la app
 * del residente, y por la misma razón elevada a otra escala: un gateway que
 * muere entre el intento y el encolado pierde un acceso que ya ocurrió, y RN-02
 * dice que ningún acceso existe sin evento. Nadie va a volver a pasar por la
 * talanquera para regenerarlo.
 *
 * Y el envío **no se intenta dentro de `alRecibirHecho`**. Si se intentara, la
 * respuesta al hardware esperaría a un tiempo de espera de red justo cuando no
 * hay red — que es el momento en que más importa abrir rápido.
 */
import type { DecisionLocal, BandejaDeSalida, SondaDeEnlace } from './puertos';
import type { DecidirLocalmente } from './decidir-localmente';
import type { HechoLocal } from './instantanea-de-reglas';
import type { EstadoDelEnlace, UmbralesDelEnlace } from './enlace-wan';
import { enlaceInicial, registrarSonda } from './enlace-wan';
import type { Reconciliacion, ResumenDeReconciliacion } from './reconciliacion';

export interface OpcionesDelGateway {
  readonly copropiedadId: string;
  readonly gatewayId: string;
  readonly umbrales: UmbralesDelEnlace;
}

export interface ResultadoDelTic {
  readonly modo: EstadoDelEnlace['modo'];
  readonly conmuto: boolean;
  readonly reconciliacion: ResumenDeReconciliacion | null;
}

export class Gateway {
  private enlace: EstadoDelEnlace = enlaceInicial();

  constructor(
    private readonly motor: DecidirLocalmente,
    private readonly bandeja: BandejaDeSalida,
    private readonly sonda: SondaDeEnlace,
    private readonly reconciliacion: Reconciliacion,
    private readonly opciones: OpcionesDelGateway,
  ) {}

  get estadoDelEnlace(): EstadoDelEnlace {
    return this.enlace;
  }

  /**
   * Un hecho del hardware. **Siempre se decide localmente**, haya WAN o no.
   *
   * Podría pensarse que con nube conviene preguntarle a ella. No: el principio
   * rector dice que Next Control decide y el hardware ejecuta, y el Edge ES
   * Next Control en esa portería. Decidir siempre igual hace que la latencia no
   * dependa del estado del enlace —KPI-13 no puede empeorar porque haya red
   * lenta— y, sobre todo, hace que el comportamiento sea UNO. Un sistema que
   * decide de dos maneras según el enlace tiene dos comportamientos que probar
   * y uno de ellos casi nunca se prueba.
   */
  alRecibirHecho(hecho: HechoLocal): DecisionLocal {
    const decision = this.motor.decidir(hecho);

    // Una decisión sin clave —referencia externa inadmisible— no se encola:
    // encolarla crearía un duplicado en cada reintento, porque la clave es lo
    // único que permite reconocerla.
    if (decision.claveIdempotencia !== '') {
      this.bandeja.encolar(
        decision.claveIdempotencia,
        JSON.stringify(this.cuerpoDe(hecho, decision)),
        hecho.ocurridoEn,
      );
    }
    return decision;
  }

  /** El tic periódico: sondear, conmutar si toca, y reconciliar si hay enlace. */
  async tic(ahora: Date): Promise<ResultadoDelTic> {
    const correcta = await this.sonda.hayEnlace();
    const antes = this.enlace.modo;
    this.enlace = registrarSonda(this.enlace, { correcta, ahora }, this.opciones.umbrales);
    const conmuto = this.enlace.modo !== antes;

    if (this.enlace.modo !== 'en_linea') {
      return { modo: this.enlace.modo, conmuto, reconciliacion: null };
    }
    const resumen = await this.reconciliacion.ejecutar(ahora);
    return { modo: this.enlace.modo, conmuto, reconciliacion: resumen };
  }

  /**
   * El cuerpo que viajará. Se serializa UNA vez, al encolar, y se reenvía tal
   * cual: volver a serializarlo al enviar cambiaría los bytes que se firman sin
   * cambiar el contenido, y la firma HMAC dejaría de cuadrar.
   */
  private cuerpoDe(hecho: HechoLocal, decision: DecisionLocal) {
    const r = decision.resultado;
    return {
      copropiedadId: this.opciones.copropiedadId,
      dispositivoId: hecho.dispositivoId,
      metodo: hecho.metodo,
      referenciaExterna: hecho.referenciaExterna,
      confianzaCentesimas: Math.round(hecho.confianza * 100),
      ...(hecho.personaId === null ? {} : { personaId: hecho.personaId }),
      ...(hecho.placaLeida === null ? {} : { placaLeida: hecho.placaLeida }),
      ...(hecho.zonaId === null ? {} : { zonaId: hecho.zonaId }),
      // El instante REAL, no el de la reconciliación (CA-22).
      ocurridoEn: hecho.ocurridoEn.toISOString(),
      cachePotencialmenteObsoleto: decision.cachePotencialmenteObsoleto,
      decision: {
        permitido: r.permitido,
        ...(r.permitido ? {} : { motivo: r.motivo }),
        reglaAplicada: r.reglaAplicada,
        versionDeReglas: r.versionDeReglas.numero,
        ...(r.permitido && r.requiereConfirmacionHumana === true
          ? { requiereConfirmacionHumana: true }
          : {}),
      },
    };
  }
}
