import type { AlmacenEvidencia, Bitacora, GeneradorDeId } from '@ncr/domain-core';
import type {
  IngestorDePublicaciones,
  PublicacionDeEquipo,
  ResultadoDeIngesta,
} from '@ncr/providers';
import type { RegistrarAcceso } from '../../eventos';
import type { AccionadorDePuerta } from '../../guardia';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';

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

export class IngestorDeEquipos implements IngestorDePublicaciones {
  constructor(
    private readonly registrar: RegistrarAcceso,
    private readonly accionador: AccionadorDePuerta,
    private readonly evidencia: AlmacenEvidencia,
    private readonly bitacora: Bitacora,
    private readonly ids: GeneradorDeId,
    private readonly equipos: readonly EquipoDeclarado[],
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

    if (constancia.valor.permitido && !constancia.valor.duplicado) {
      const orden = await this.accionador.accionar(evento.dispositivoId, true);
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

  private copropiedadDe(dispositivoId: string): string | null {
    return this.equipos.find((e) => e.dispositivoId === dispositivoId)?.copropiedadId ?? null;
  }

  /**
   * Devuelve `null` si no hay imagen o si el almacén no respondió a tiempo.
   * Nunca lanza: el evento pesa más que su fotografía.
   */
  private async guardarEvidencia(
    imagen: Buffer | null,
    dispositivoId: string,
  ): Promise<string | null> {
    if (imagen === null || imagen.length === 0) return null;
    const clave = `lpr/${dispositivoId}/${this.ids.nuevo()}.jpg`;
    try {
      const guardada = await Promise.race([
        this.evidencia.guardar(clave, imagen, 'image/jpeg'),
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
