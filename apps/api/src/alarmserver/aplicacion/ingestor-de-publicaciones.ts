import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type {
  EventoDeEquipo,
  IngestorDePublicaciones,
  PublicacionDeEquipo,
  ResultadoDeIngesta,
  VeredictoRemoto,
} from '@ncr/providers';
import type { RegistrarAcceso } from '../../eventos';
import { registroSinBase } from '../../eventos';
import type { RegistroDeEvidencia, TipoDeEvidencia } from '../../eventos';
import type { AccionadorDePuerta } from '../../guardia';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';
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

export class IngestorDeEquipos implements IngestorDePublicaciones {
  constructor(
    private readonly registrar: RegistrarAcceso,
    private readonly accionador: AccionadorDePuerta,
    private readonly evidencia: AlmacenEvidencia,
    private readonly bitacora: Bitacora,
    private readonly ids: GeneradorDeId,
    private readonly equipos: readonly EquipoDeclarado[],
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
  ) {}

  async ingerir(publicacion: PublicacionDeEquipo): Promise<ResultadoDeIngesta> {
    const evento = publicacion.evento;
    const copropiedadId = this.copropiedadDe(evento.dispositivoId);
    if (copropiedadId === null) {
      // Sin copropiedad no se escribe: un evento sin frontera de tenant es
      // exactamente lo que RN-15 impide, y adivinarla sería peor que perderlo.
      this.bitacora.registrar('error', 'lectura de un equipo sin copropiedad declarada', {
        dispositivoId: evento.dispositivoId,
      });
      return { registrado: false, motivo: 'el equipo no tiene copropiedad declarada' };
    }
    if (evento.clase === 'rostro') return this.ingerirRostro(publicacion, copropiedadId);
    if (evento.clase === 'llamada' || evento.clase === 'timbre') {
      return this.ingerirLlamada(evento, copropiedadId, evento.clase);
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
    }

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
    this.bitacora.registrar('info', 'llamada del videoportero recibida', {
      copropiedadId,
      dispositivoId: evento.dispositivoId,
      origen: evento.origenDeLlamada,
      viviendaResuelta: vivienda !== null,
    });
    return { registrado: false, motivo: 'llamada: avisada a las consolas; no es un acceso' };
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

  /** Devuelve el veredicto y MIDE cuánto tardó el equipo en aceptarlo. */
  private async responder(
    evento: EventoDeEquipo,
    veredicto: VeredictoRemoto,
    comienzo: number,
  ): Promise<void> {
    try {
      const r = await this.respondedor.responderVerificacionRemota(evento.dispositivoId, veredicto);
      const totalMs = this.reloj.ahora().getTime() - comienzo;
      this.bitacora.registrar(r.aceptado ? 'info' : 'aviso', 'veredicto devuelto a la terminal', {
        dispositivoId: evento.dispositivoId,
        serie: veredicto.serie,
        permitido: veredicto.permitido,
        aceptadoPorElEquipo: r.aceptado,
        latenciaDelEquipoMs: r.latenciaMs,
        // Del hecho recibido al veredicto aceptado: la cifra que decide si la
        // terminal espera lo bastante (S-41).
        respuestaTotalMs: totalMs,
      });
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo devolver el veredicto a la terminal', {
        dispositivoId: evento.dispositivoId,
        serie: veredicto.serie,
        error: error instanceof Error ? error.message : String(error),
        motivo: 'la terminal negará por su cuenta al vencer su plazo (S-41): la dirección segura',
      });
    }
  }

  private copropiedadDe(dispositivoId: string): string | null {
    return this.equipos.find((e) => e.dispositivoId === dispositivoId)?.copropiedadId ?? null;
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
