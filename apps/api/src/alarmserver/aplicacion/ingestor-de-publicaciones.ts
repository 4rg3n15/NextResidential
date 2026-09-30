import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type {
  EventoDeEquipo,
  IngestorDePublicaciones,
  PublicacionDeEquipo,
  ResultadoDeIngesta,
  VeredictoRemoto,
} from '@ncr/providers';
import type { AlertasDeEquipo, RegistrarAcceso } from '../../eventos';
import { alertaDeAtencionDeEquipo } from './alerta-de-atencion';
import { registroSinBase } from '../../eventos';
import type { RegistroDeEvidencia, TipoDeEvidencia } from '../../eventos';
import type { AccionadorDePuerta } from '../../guardia';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { CopropiedadDelEquipoPorRegistro } from './copropiedad-del-equipo';
import { ConstanciasDeEquipo, constanciasSinRegistro } from './constancias-de-equipo';
import type { RegistroDeConstancias } from './constancias-de-equipo';
import type {
  AvisadorDeLlamadas,
  LlamadaEntrante,
  ResolutorDeTitularBiometrico,
  ResolutorDeViviendaDeLlamada,
} from './puertos';

/**
 * A2 · a quién se le devuelve el veredicto. Declarado aquí, por el consumidor:
 * el ingestor no sabe qué adaptador hay detrás ni le importa.
 */
export interface RespondedorDeVerificacionRemota {
  responderVerificacionRemota(
    dispositivoId: string,
    veredicto: VeredictoRemoto,
  ): Promise<{ readonly aceptado: boolean; readonly latenciaMs: number }>;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * [SUPUESTO] S-40 · LA CONFIANZA DE UN ROSTRO QUE LA TERMINAL YA RECONOCIÓ
 *
 * El evento de control de acceso no trae una confianza comparable a la de la
 * placa: la terminal ya comparó contra su biblioteca con su propio umbral y
 * sólo publica cuando reconoció. Se entrega 1 al motor —«identificación
 * cierta»— y se deja escrito: si el firmware publica una similitud, se lee de
 * ahí (`confianza` del evento) y este valor deja de usarse. No es decidir por
 * el equipo: la autorización, la vigencia, la lista negra y el consentimiento
 * siguen siendo del motor.
 */
export const CONFIANZA_DE_ROSTRO_RECONOCIDO = 1;

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ÚNICO CAMINO DE UNA LECTURA A UN HECHO REGISTRADO
 *
 * Hasta la 15-C esto vivía dentro del controlador del receptor, y ése era el
 * problema: el puerto `PlateEventSource` estaba declarado y el receptor lo
 * esquivaba, llamando al caso de uso por su cuenta. El puerto quedaba de
 * adorno, y un adorno afirma un desacople que no existe.
 *
 * Ahora hay **un solo ingestor** y los dos transportes publican en la misma
 * fuente. Da igual si el evento entró porque el equipo lo empujó o porque
 * nosotros mantenemos su flujo abierto: el camino a `RegistrarAcceso` es éste y
 * no hay otro.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ORDEN, Y LO QUE CUESTA CADA PASO
 *
 * 1 · guardar la evidencia, **acotada por tiempo**;
 * 2 · decidir y registrar el evento inmutable — RN-02: no hay rama que abra sin
 *     dejar evento;
 * 3 · accionar, sólo si el evento quedó permitido y no era un duplicado.
 *
 * El paso 1 va antes del 2 porque `eventos` es append-only (ADR-05): un evento
 * escrito sin su evidencia no se puede corregir después. Y va acotado porque
 * está dentro del tramo que mide KPI-13: si el almacén tarda, se sigue sin
 * evidencia y **se registra que se siguió**. Perder la foto es malo; dejar la
 * talanquera cerrada porque el almacén de objetos va lento, peor.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * AQUÍ NO SE DECIDE NADA
 *
 * Este servicio traduce un hecho del equipo al caso de uso que ya usan la
 * ingesta firmada y el Edge. La cámara reporta; el motor de reglas decide; y
 * sólo después, si la decisión fue permitir, se acciona el relé. Duplicar aquí
 * la decisión vaciaría el motor de reglas y la trazabilidad.
 */

/** Techo del tramo de evidencia dentro del presupuesto de KPI-13 (3 s). */
export const PRESUPUESTO_DE_EVIDENCIA_MS = 800;

/** El único ingestor de publicaciones de equipo del proceso (A1). */
export const INGESTOR_DE_EQUIPOS = Symbol.for('ncr.alarmserver.IngestorDeEquipos');

/**
 * 15-L · lo que el ingestor usa además de lo de siempre, agrupado para no
 * alargar más el constructor: dónde deja las constancias de la línea de
 * tiempo (Bloque B) y a quién pregunta si una cámara decide sola (A4).
 */
export interface ComplementosDelIngestor {
  readonly eventosDeEquipo?: RegistroDeConstancias;
  readonly control?: { decideSolo?(dispositivoId: string): Promise<boolean | null> };
  /**
   * E5 (15-M) · las alertas ligadas al equipo, deduplicadas: la cámara que
   * decide sola es UNA alerta por cámara mientras dure; el reloj desviado, una
   * con el valor. Sin esto (dobles antiguos) se conserva la constancia por lectura.
   */
  readonly alertas?: AlertasDeEquipo;
  /** Desvío del reloj del equipo, en ms, a partir del cual se avisa. */
  readonly desvioDeRelojMs?: number;
}

/** [SUPUESTO] S-122 · 30 s de desvío ya fecha mal los eventos y se avisa. */
export const DESVIO_DE_RELOJ_MS = 30_000;

export class IngestorDeEquipos implements IngestorDePublicaciones {
  constructor(
    private readonly registrar: RegistrarAcceso,
    private readonly accionador: AccionadorDePuerta,
    private readonly evidencia: AlmacenEvidencia,
    private readonly bitacora: Bitacora,
    private readonly ids: GeneradorDeId,
    /** R1 (15-L) · de quién es el equipo: el registro, y la declaración de respaldo. */
    private readonly copropiedades: Pick<CopropiedadDelEquipoPorRegistro, 'resolver'>,
    /** A2 · quién traduce la plantilla que la terminal reconoció a una persona. */
    private readonly titulares: ResolutorDeTitularBiometrico,
    /** A2 · a quién se le devuelve el veredicto: el proveedor de equipos. */
    private readonly respondedor: RespondedorDeVerificacionRemota,
    private readonly reloj: Reloj,
    /** A4 · la llamada del videoportero: quién resuelve la vivienda y quién avisa. */
    private readonly viviendas: ResolutorDeViviendaDeLlamada,
    private readonly avisador: AvisadorDeLlamadas,
    /** H-15I-07 · la fila de `evidencias` que el evento referencia (con base). */
    private readonly registroDeEvidencia: RegistroDeEvidencia = registroSinBase,
    private readonly complementos: ComplementosDelIngestor = {},
  ) {
    this.constancias = new ConstanciasDeEquipo(
      complementos.eventosDeEquipo ?? constanciasSinRegistro,
      ids,
    );
  }

  private readonly constancias: ConstanciasDeEquipo;

  /**
   * §4 (15-K) · UNA LÍNEA `info` POR CADA EVENTO QUE LLEGA DE UN EQUIPO: tipo,
   * equipo y resultado. En sitio había que buscar entre veinte mensajes para
   * saber si un evento había entrado; ahora sale uno por evento, siempre con
   * la misma forma, también cuando se descarta o falla.
   */
  async ingerir(publicacion: PublicacionDeEquipo): Promise<ResultadoDeIngesta> {
    const { evento, transporte } = publicacion;
    const linea = {
      tipo: evento.clase,
      dispositivoId: evento.dispositivoId,
      transporte,
    };
    try {
      const resultado = await this.procesar(publicacion);
      // E5 (15-M) · el volcado histórico (miles de `currentEvent=false` en
      // ráfaga) NO deja una línea por evento: su resumen lo escribe el
      // registro por lotes. Lo vivo sigue dejando su línea.
      if (evento.enVivo) {
        this.bitacora.registrar('info', 'evento de equipo', {
          ...linea,
          resultado: resultado.registrado ? 'registrado' : 'no registrado',
          ...(resultado.motivo === null ? {} : { motivo: resultado.motivo }),
        });
      }
      return resultado;
    } catch (error) {
      this.bitacora.registrar('error', 'evento de equipo', {
        ...linea,
        resultado: 'falló',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async procesar(publicacion: PublicacionDeEquipo): Promise<ResultadoDeIngesta> {
    const evento = publicacion.evento;
    const resuelta = await this.copropiedades.resolver(evento.dispositivoId);
    if (resuelta.copropiedadId === null) {
      // Sin copropiedad no se escribe: un evento sin frontera de tenant es
      // exactamente lo que RN-15 impide, y adivinarla sería peor que perderlo.
      this.bitacora.registrar('error', 'evento de un equipo sin copropiedad', {
        dispositivoId: evento.dispositivoId,
        motivo: resuelta.motivo,
      });
      return { registrado: false, motivo: `equipo sin copropiedad: ${resuelta.motivo}` };
    }
    const copropiedadId = resuelta.copropiedadId;
    /**
     * 15-L (Bloque B) · lo HISTÓRICO se guarda —marcado— y no hace nada más:
     * ni motor, ni aviso, ni veredicto. Va a una cola que nunca retrasa a un
     * evento vivo.
     */
    if (!evento.enVivo) {
      await this.constancias.delEquipo(evento, copropiedadId);
      return { registrado: true, motivo: 'histórico: guardado sin decidir' };
    }
    if (evento.clase === 'rostro') return this.ingerirRostro(publicacion, copropiedadId);
    if (evento.clase === 'llamada' || evento.clase === 'timbre') {
      await this.constancias.delEquipo(evento, copropiedadId);
      // Sólo la llamada que EMPIEZA y el timbre avisan; cancelar, contestar o
      // colgar se guardan y se ven en la línea de tiempo, sin otra alerta.
      if (evento.clase === 'timbre' || evento.tipo === 'llamada') {
        return this.ingerirLlamada(evento, copropiedadId, evento.clase);
      }
      return { registrado: true, motivo: null };
    }
    if (evento.clase !== 'placa' || evento.placa === null) {
      // Puerta, botón, sabotaje, estado, un código sin catalogar —o un vehículo
      // detectado sin lectura—: a la consola, nunca al motor como un acceso.
      await this.constancias.delEquipo(evento, copropiedadId);
      // G2 (15-N) · rostro no reconocido o negado por el equipo, lista negra del equipo.
      this.alertarAtencion(evento, copropiedadId);
      return { registrado: true, motivo: null };
    }

    if (evento.horaSinDesplazamiento) {
      // No es un detalle de formato: si se interpretara en la zona del proceso,
      // el evento quedaría corrido las horas que separen al servidor del
      // conjunto, en una tabla que no admite corrección.
      this.bitacora.registrar('aviso', 'el equipo emitió una hora SIN desplazamiento horario', {
        dispositivoId: evento.dispositivoId,
        motivo:
          'se usó la hora de recepción. Configure la zona horaria del equipo: interpretarla ' +
          'en la zona del servidor correría el histórico sin que nada fallara',
      });
    }

    // E5 (15-M) · el desvío del reloj del equipo se AVISA una vez, con el valor;
    // la latencia se mide con la hora de recepción, nunca con la del equipo.
    void this.avisarSiElRelojSeDesvio(evento, copropiedadId);

    const referencia =
      evento.referenciaDelEquipo ?? `${evento.placa ?? ''}-${String(+evento.ocurridoEn)}`;
    const evidenciaId = await this.guardarEvidencia(
      publicacion.foto ?? publicacion.recorte,
      evento.dispositivoId,
      copropiedadId,
      publicacion.foto === null || publicacion.foto === undefined
        ? 'recorte_placa'
        : 'foto_completa',
    );

    const constancia = await this.registrar.ejecutar(
      {
        copropiedadId,
        dispositivoId: evento.dispositivoId,
        metodo: 'placa',
        referenciaExterna: referencia,
        // Sin confianza declarada se entrega 0 y **no** 1: el umbral de lectura
        // dudosa (CU-01, excepción 3a) tiene que poder actuar, y suponer certeza
        // donde el equipo no la afirma es decidir por él.
        confianza: evento.confianza ?? 0,
        placaLeida: evento.placa ?? '',
        evidenciaId,
        ocurridoEn: evento.ocurridoEn,
      },
      ACTOR_INGESTA,
    );

    if (!constancia.ok) {
      this.bitacora.registrar('error', 'el hecho de la cámara no se pudo registrar', {
        dispositivoId: evento.dispositivoId,
        detalle: constancia.error.detalle,
      });
      return { registrado: false, motivo: 'el hecho no se pudo registrar' };
    }

    if (constancia.valor.requiereConfirmacionHumana && !constancia.valor.duplicado) {
      // H-15I-09 · CU-01, excepción 3a: lectura DUDOSA. El motor identificó la
      // placa pero no con la confianza para decidir solo: la barrera NO se
      // acciona aquí. El evento ya está en portería con su evidencia y la
      // apertura, si procede, la hace una persona con motivo (RN-08, CA-16).
      this.bitacora.registrar('aviso', 'lectura dudosa: la apertura la confirma la portería', {
        dispositivoId: evento.dispositivoId,
        eventoId: constancia.valor.eventoId,
        confianza: evento.confianza ?? 0,
      });
    } else if (constancia.valor.permitido && !constancia.valor.duplicado) {
      // La apertura decidida por el motor se atribuye a la identidad de
      // servicio de la ingesta: el proveedor exige un actor (RN-08) y el
      // operador aquí es el sistema, no una persona.
      const orden = await this.accionador.accionar(evento.dispositivoId, true, ACTOR_INGESTA);
      this.bitacora.registrar(orden.estado === 'aceptada' ? 'info' : 'aviso', 'relé accionado', {
        dispositivoId: evento.dispositivoId,
        eventoId: constancia.valor.eventoId,
        estado: orden.estado,
        latenciaDelEquipoMs: orden.latenciaMs,
      });
      // A1 · toda apertura deja evento, salga bien o mal, con el desenlace legible.
      await this.constancias.apertura(evento, copropiedadId, orden, constancia.valor.eventoId);
    }
    // A4 · marcar, sin retrasar la respuesta al equipo, si la cámara decidió sola.
    void this.marcarSiLaCamaraDecidio(evento, copropiedadId, constancia.valor.eventoId);

    this.bitacora.registrar('info', 'lectura de placa procesada', {
      copropiedadId,
      dispositivoId: evento.dispositivoId,
      transporte: publicacion.transporte,
      permitido: constancia.valor.permitido,
      duplicado: constancia.valor.duplicado,
      conEvidencia: evidenciaId !== null,
      /**
       * QUIÉN ABRIÓ, según el propio equipo. Es evidencia de auditoría: un
       * `lista` o un `anomalo` significan que la cámara está decidiendo por su
       * cuenta y que esta decisión nuestra llegó tarde. Se registra siempre,
       * incluso cuando es `null` —que es lo normal y significa que el control
       * de barrera del equipo está deshabilitado—.
       */
      quienAbrioSegunElEquipo: evento.quienAbrio,
      tipoDePlaca: evento.tipoDePlaca,
      pais: evento.pais,
      carril: evento.carril,
    });

    if (evento.quienAbrio === 'lista' || evento.quienAbrio === 'anomalo') {
      this.bitacora.registrar('aviso', 'EL EQUIPO ABRIÓ POR SU CUENTA', {
        dispositivoId: evento.dispositivoId,
        quienAbrio: evento.quienAbrio,
        motivo:
          'la cámara declaró haber abierto ella. El motor de reglas decidió después, ' +
          'y su decisión no gobernó el paso. Revise el modo de control del equipo (debe ser 1)',
      });
    }

    return { registrado: true, motivo: null };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * A2 · EL ROSTRO QUE LA TERMINAL RECONOCIÓ, Y EL VEREDICTO DE VUELTA
   *
   * El MISMO caso de uso que la placa y el Edge —`RegistrarAcceso`— decide y
   * deja el evento; lo que cambia es el método (`facial`), la persona (el
   * titular de la plantilla, no el `FPID`) y que aquí NO se acciona ningún
   * relé: con la terminal esperando, quien abre es la propia terminal al
   * recibir `success`. Una segunda orden de apertura abriría dos veces.
   *
   * Un `FPID` que Next Control no gestiona —alguien enrolado directamente en
   * el aparato— se registra sin persona: el motor lo niega (no hay vivienda
   * ni autorización a la que atribuirlo) y la terminal recibe `failed`. Es un
   * hallazgo de seguridad y se registra como tal: hay una plantilla en la
   * terminal que no pasó por CU-02.
   *
   * Y el tiempo de respuesta se MIDE: desde que llegó el hecho hasta que el
   * equipo aceptó el veredicto. Es la cifra que decide si la terminal espera
   * lo bastante; qué hace el equipo si no llega a tiempo está en S-41.
   */
  /**
   * A4 · LA LLAMADA NO ES UN ACCESO, Y POR ESO NO PASA POR EL MOTOR
   *
   * Nadie pidió entrar todavía: alguien llamó. Lo que corresponde es que la
   * portería y la guardia virtual lo VEAN en el acto (RN-18, KPI-25), con la
   * vivienda a la que llama si el equipo declara la unidad; abrir sigue
   * siendo una orden aparte, atribuida al operador (RN-08, CA-20). No hay
   * fila en `eventos`: un timbre no es un hecho de acceso y escribirlo como
   * tal falsearía el histórico.
   */
  private async ingerirLlamada(
    evento: EventoDeEquipo,
    copropiedadId: string,
    clase: 'llamada' | 'timbre',
  ): Promise<ResultadoDeIngesta> {
    const vivienda = await this.viviendaDeLaLlamada(copropiedadId, evento);
    const llamada: LlamadaEntrante = {
      copropiedadId,
      dispositivoId: evento.dispositivoId,
      clase,
      viviendaId: vivienda?.id ?? null,
      vivienda: vivienda?.identificador ?? evento.unidadDeLlamada,
      origen: evento.origenDeLlamada,
      ocurridoEn: evento.ocurridoEn,
      referenciaExterna: evento.referenciaDelEquipo,
    };
    await this.avisador.llamadaEntrante(llamada);
    // G2 (15-N) · la llamada abre su alerta (una por equipo y ventana).
    this.alertarAtencion(evento, copropiedadId);
    this.bitacora.registrar('info', 'llamada del videoportero recibida', {
      copropiedadId,
      dispositivoId: evento.dispositivoId,
      origen: evento.origenDeLlamada,
      viviendaResuelta: vivienda !== null,
    });
    // 15-L · ya no es «no registrado»: queda en `eventos_de_equipo` (Bloque B).
    return { registrado: true, motivo: null };
  }

  /** G2 (15-N) · sin esperar: la ingesta pesa más que su alerta, que nunca lanza. */
  private alertarAtencion(evento: EventoDeEquipo, copropiedadId: string): void {
    const nueva = alertaDeAtencionDeEquipo(evento, copropiedadId);
    if (nueva !== null) void this.complementos.alertas?.ejecutar(nueva, ACTOR_INGESTA);
  }

  /** La vivienda, si el equipo dice la unidad y el padrón la reconoce. Nunca lanza. */
  private async viviendaDeLaLlamada(
    copropiedadId: string,
    evento: EventoDeEquipo,
  ): Promise<{ readonly id: string; readonly identificador: string } | null> {
    if (evento.unidadDeLlamada === null) return null;
    try {
      return await this.viviendas.porUnidad(
        copropiedadId,
        evento.edificioDeLlamada,
        evento.unidadDeLlamada,
      );
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo resolver la vivienda de la llamada', {
        copropiedadId,
        unidad: evento.unidadDeLlamada,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async ingerirRostro(
    publicacion: PublicacionDeEquipo,
    copropiedadId: string,
  ): Promise<ResultadoDeIngesta> {
    const evento = publicacion.evento;
    if (evento.esResultadoDeVerificacion) {
      // El desenlace de una verificación YA contestada: informativo. Volver a
      // decidirlo produciría dos eventos por un mismo hecho.
      this.bitacora.registrar('info', 'resultado de verificación remota recibido (informativo)', {
        copropiedadId,
        dispositivoId: evento.dispositivoId,
        serie: evento.serieDelEquipo,
      });
      return { registrado: false, motivo: 'resultado de verificación: informativo' };
    }
    const comienzo = this.reloj.ahora().getTime();
    const plantillaId = evento.personaId;
    const titularId =
      plantillaId === null
        ? null
        : await this.titulares.titularDePlantilla(copropiedadId, plantillaId);
    if (plantillaId !== null && titularId === null) {
      this.bitacora.registrar(
        'error',
        'HALLAZGO · la terminal reconoció una plantilla que Next Control no gestiona',
        {
          copropiedadId,
          dispositivoId: evento.dispositivoId,
          plantillaId,
          motivo:
            'hay un rostro enrolado en el equipo sin pasar por CU-02 (consentimiento, supresión). ' +
            'Se niega y se registra; revise la biblioteca del equipo',
        },
      );
    }

    const evidenciaId = await this.guardarEvidencia(
      publicacion.foto,
      evento.dispositivoId,
      copropiedadId,
      'captura_rostro',
    );
    const constancia = await this.registrar.ejecutar(
      {
        copropiedadId,
        dispositivoId: evento.dispositivoId,
        metodo: 'facial',
        referenciaExterna:
          evento.referenciaDelEquipo ??
          `${plantillaId ?? 'desconocida'}-${String(evento.serieDelEquipo ?? +evento.ocurridoEn)}`,
        confianza: evento.confianza ?? CONFIANZA_DE_ROSTRO_RECONOCIDO,
        personaId: titularId,
        evidenciaId,
        ocurridoEn: evento.ocurridoEn,
      },
      ACTOR_INGESTA,
    );
    if (!constancia.ok) {
      this.bitacora.registrar('error', 'el hecho de la terminal no se pudo registrar', {
        dispositivoId: evento.dispositivoId,
        detalle: constancia.error.detalle,
      });
      await this.responder(
        evento,
        { serie: evento.serieDelEquipo, permitido: false, motivo: 'FALLO_TECNICO' },
        comienzo,
        copropiedadId,
        null,
      );
      return { registrado: false, motivo: 'el hecho no se pudo registrar' };
    }

    const permitido =
      constancia.valor.permitido &&
      !constancia.valor.duplicado &&
      !constancia.valor.requiereConfirmacionHumana;
    if (evento.esperaVeredicto) {
      await this.responder(
        evento,
        {
          serie: evento.serieDelEquipo,
          permitido,
          motivo: permitido
            ? 'acceso permitido'
            : constancia.valor.duplicado
              ? 'DUPLICADO'
              : 'acceso negado',
        },
        comienzo,
        copropiedadId,
        constancia.valor.eventoId,
      );
    } else {
      // Terminal en `decide_el_equipo`: ya abrió sola. Se registra lo que
      // decidió el motor para la traza, y se dice que la decisión llegó tarde.
      this.bitacora.registrar(
        'aviso',
        'la terminal reconoció y decidió sola; el motor decidió después',
        {
          copropiedadId,
          dispositivoId: evento.dispositivoId,
          permitidoPorElMotor: permitido,
          motivo: 'modo decide_el_equipo: revise la verificación remota en la ficha del equipo',
        },
      );
    }
    this.bitacora.registrar('info', 'rostro de terminal procesado', {
      copropiedadId,
      dispositivoId: evento.dispositivoId,
      transporte: publicacion.transporte,
      titularId,
      permitido: constancia.valor.permitido,
      duplicado: constancia.valor.duplicado,
      esperabaVeredicto: evento.esperaVeredicto,
      conEvidencia: evidenciaId !== null,
    });
    return { registrado: true, motivo: null };
  }

  /**
   * A4 (15-L) · mientras la cámara no opere bajo la plataforma (sin
   * atestación D-11), la lectura se registra y se enseña igual, MARCADA «la
   * cámara decidió por su cuenta». También si el propio equipo declara que
   * abrió él (`openGateType`). Nunca lanza.
   */
  private async marcarSiLaCamaraDecidio(
    evento: EventoDeEquipo,
    copropiedadId: string,
    eventoId: string | null,
  ): Promise<void> {
    try {
      let motivo: string | null = null;
      if (evento.quienAbrio === 'lista' || evento.quienAbrio === 'anomalo') {
        motivo = 'la cámara declaró haber abierto ella (lista interna o excepción suya)';
      } else if ((await this.complementos.control?.decideSolo?.(evento.dispositivoId)) === true) {
        motivo =
          'la cámara no opera bajo control de la plataforma y no tiene atestación vigente: ' +
          'la talanquera la gobierna el equipo';
      }
      if (motivo === null) return;
      const alertas = this.complementos.alertas;
      if (alertas === undefined) {
        await this.constancias.decidioLaCamara(evento, copropiedadId, motivo, eventoId);
        return;
      }
      // E5 (15-M) · UNA alerta por cámara mientras dure la condición: la
      // constancia en la línea de tiempo sólo acompaña a la alerta que se abre;
      // las lecturas siguientes no crean nada más.
      const abierta = await alertas.ejecutar(
        {
          copropiedadId,
          dispositivoId: evento.dispositivoId,
          tipo: 'acceso_dudoso',
          severidad: 'alta',
          clave: 'camara_decide_sola',
          notas: `La cámara decidió por su cuenta: ${motivo}`,
          persistente: true,
          eventoId,
        },
        ACTOR_INGESTA,
      );
      if (abierta.alerta !== null) {
        await this.constancias.decidioLaCamara(evento, copropiedadId, motivo, eventoId);
      }
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo comprobar si la cámara decidió sola', {
        dispositivoId: evento.dispositivoId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * E5 (15-M) · la hora del equipo contra la de RECEPCIÓN: si se desvía más
   * del umbral, UNA alerta (deduplicada por ventana) con el valor medido. En
   * sitio el reloj adelantado daba latencias de -53 s. Nunca lanza.
   */
  private async avisarSiElRelojSeDesvio(
    evento: EventoDeEquipo,
    copropiedadId: string,
  ): Promise<void> {
    const alertas = this.complementos.alertas;
    // Sólo lo VIVO: un volcado histórico trae horas pasadas por definición.
    if (alertas === undefined || evento.horaSinDesplazamiento || !evento.enVivo) return;
    const desvioMs = evento.ocurridoEn.getTime() - this.reloj.ahora().getTime();
    const umbral = this.complementos.desvioDeRelojMs ?? DESVIO_DE_RELOJ_MS;
    if (Math.abs(desvioMs) < umbral) return;
    const segundos = Math.round(desvioMs / 1000);
    await alertas.ejecutar(
      {
        copropiedadId,
        dispositivoId: evento.dispositivoId,
        // [SUPUESTO] S-123 · el dominio no tiene un tipo para el reloj y no se
        // toca en esta etapa: `acceso_dudoso` INFORMATIVA (los accesos de ese
        // equipo quedan mal fechados), distinguida por su clave. Nunca
        // `sabotaje`: el operador lo leería como manipulación del equipo.
        tipo: 'acceso_dudoso',
        severidad: 'informativa',
        clave: 'reloj_desviado',
        notas:
          `El reloj del equipo va ${String(Math.abs(segundos))} s ${segundos > 0 ? 'adelantado' : 'atrasado'} ` +
          'respecto de la API: sincronícelo (NTP) o sus eventos quedarán mal fechados',
        persistente: true,
      },
      ACTOR_INGESTA,
    );
  }

  /** Devuelve el veredicto y MIDE cuánto tardó el equipo en aceptarlo. */
  private async responder(
    evento: EventoDeEquipo,
    veredicto: VeredictoRemoto,
    comienzo: number,
    copropiedadId: string,
    eventoId: string | null,
  ): Promise<void> {
    let aceptado = false;
    let duracionMs: number;
    try {
      const r = await this.respondedor.responderVerificacionRemota(evento.dispositivoId, veredicto);
      aceptado = r.aceptado;
      duracionMs = this.reloj.ahora().getTime() - comienzo;
      this.bitacora.registrar(r.aceptado ? 'info' : 'aviso', 'veredicto devuelto a la terminal', {
        dispositivoId: evento.dispositivoId,
        serie: veredicto.serie,
        permitido: veredicto.permitido,
        aceptadoPorElEquipo: r.aceptado,
        latenciaDelEquipoMs: r.latenciaMs,
        // Del hecho recibido al veredicto aceptado: la cifra que decide si la
        // terminal espera lo bastante (S-41).
        respuestaTotalMs: duracionMs,
      });
    } catch (error) {
      duracionMs = this.reloj.ahora().getTime() - comienzo;
      this.bitacora.registrar('error', 'no se pudo devolver el veredicto a la terminal', {
        dispositivoId: evento.dispositivoId,
        serie: veredicto.serie,
        // F2 (corrección de la 15-L) · también cuando falla: es la cifra que
        // decide si hace falta el plan B (desactivar la verificación remota).
        respuestaTotalMs: duracionMs,
        error: error instanceof Error ? error.message : String(error),
        motivo: 'la terminal negará por su cuenta al vencer su plazo (S-41): la dirección segura',
      });
    }
    // 15-L (Bloque B) · la respuesta a la terminal también se ve en la consola,
    // DESPUÉS de enviarla: escribirla antes gastaría plazo de la terminal. Con
    // su duración, para que el ensayo mida p50/p95 contra el plazo (F2).
    await this.constancias.veredicto(
      evento,
      copropiedadId,
      veredicto,
      aceptado,
      eventoId,
      duracionMs,
    );
  }

  /**
   * Devuelve `null` si no hay imagen o si el almacén no respondió a tiempo.
   * Nunca lanza: el evento pesa más que su fotografía.
   */
  private async guardarEvidencia(
    imagen: Buffer | null | undefined,
    dispositivoId: string,
    copropiedadId: string,
    tipo: TipoDeEvidencia,
  ): Promise<string | null> {
    if (imagen === null || imagen === undefined || imagen.length === 0) return null;
    const clave = `lpr/${dispositivoId}/${this.ids.nuevo()}.jpg`;
    try {
      const guardada = await Promise.race([
        this.evidencia.guardar(clave, imagen, 'image/jpeg').then((ruta) =>
          this.registroDeEvidencia.registrar({
            copropiedadId,
            clave: ruta,
            tipo,
            contenido: imagen,
            tipoMime: 'image/jpeg',
          }),
        ),
        new Promise<null>((resolver) =>
          setTimeout(() => resolver(null), PRESUPUESTO_DE_EVIDENCIA_MS),
        ),
      ]);
      if (guardada === null) {
        this.bitacora.registrar('aviso', 'evidencia descartada por presupuesto de tiempo', {
          dispositivoId,
          presupuestoMs: PRESUPUESTO_DE_EVIDENCIA_MS,
        });
        return null;
      }
      return guardada;
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo guardar la evidencia de la lectura', {
        dispositivoId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
