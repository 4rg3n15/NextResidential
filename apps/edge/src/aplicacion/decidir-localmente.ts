/**
 * CU-04 · La decisión de acceso cuando no hay nube. RN-16, CA-21, KPI-31.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA LÍNEA QUE ESTE FICHERO NO CRUZA
 *
 * **No hay una sola regla de acceso escrita aquí.** Ni un `if` sobre vigencias,
 * ni sobre listas negras, ni sobre horarios. Lo único que hace es armar el
 * contexto —que es armar datos, no decidir— y llamar a `evaluarAcceso` de
 * `@ncr/domain-core`, el mismo que ejecuta la nube.
 *
 * Eso es RN-16 y es verificable, no una promesa: `test/misma-decision.test.ts`
 * evalúa los mismos contextos por los dos caminos y exige resultado idéntico,
 * motivo incluido. Si alguien añadiera aquí una condición «solo para el Edge»,
 * esa prueba se pondría roja el mismo día.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE SÍ DECIDE, PORQUE NO ES UNA REGLA DE ACCESO
 *
 * Tres cosas, y ninguna es «quién entra»:
 *
 * 1. **Qué hacer cuando no hay caché** (CU-04 3a). Sin instantánea no hay
 *    contexto que armar, así que no hay nada que preguntarle al motor. La
 *    política es configurable y su valor por omisión es `denegar` (§2.1.4).
 *    `escalar` no abre: entrega el caso al portero, que es una persona
 *    decidiendo, no el Edge.
 * 2. **Si la caché pudo envejecer** (KPI-31). No impide decidir —un gateway que
 *    se negara a operar tras 24 h sin conexión incumpliría KPI-30, que es lo
 *    contrario de lo que se le pide— pero marca el evento. El marcado es lo que
 *    permite, al reconciliar, distinguir lo decidido con reglas frescas de lo
 *    decidido con reglas de ayer.
 * 3. **La clave de idempotencia**, que la construye el DOMINIO
 *    (`construirClaveIdempotencia`) y no este fichero: es la misma que usaría
 *    la nube para el mismo hecho, y de eso depende que el reenvío se descarte.
 */
import { construirClaveIdempotencia, esFallo, evaluarAcceso, negar } from '@ncr/domain-core';
import { VersionDeReglas } from '@ncr/domain-core';
import type { Politica, ResultadoAcceso } from '@ncr/domain-core';
import type { Contingencia } from '../configuracion/esquema';
import { contextoDesde, instantaneaUsable, resolverIdentidad } from './instantanea-de-reglas';
import type { HechoLocal, InstantaneaDeReglas } from './instantanea-de-reglas';
import type { CacheDeReglas, DecisionLocal } from './puertos';

export interface OpcionesDeDecision {
  readonly copropiedadId: string;
  readonly contingencia: Contingencia;
  /** KPI-31 · minutos a partir de los cuales la instantánea se marca. */
  readonly cacheObsoletaMinutos: number;
  /** Se inyecta para poder probar el motor con reglas distintas (OCP). */
  readonly reglas?: readonly Politica[];
}

/**
 * Versión de reglas para un hecho que NO llegó al motor.
 *
 * Un evento sin versión sería un evento que no se puede auditar, y CA-21 pide
 * exactamente lo contrario. Se usa la de la instantánea si la hay, y `v1` de la
 * copropiedad cuando no hay ninguna: el número es falso pero el sello existe, y
 * el evento viaja además marcado como resuelto por contingencia, así que nadie
 * lo confunde con una decisión del motor.
 */
const versionParaContingencia = (
  copropiedadId: string,
  instantanea: InstantaneaDeReglas | null,
): VersionDeReglas => {
  const v = VersionDeReglas.crear(instantanea?.version ?? 1, copropiedadId);
  if (!esFallo(v)) return v.valor;
  // Inalcanzable con una copropiedad válida; si llegara, el fallo técnico es la
  // respuesta correcta y no una excepción que tumbe el gateway.
  const fallback = VersionDeReglas.crear(1, 'desconocida');
  /* c8 ignore next */
  if (esFallo(fallback)) throw new Error('no se pudo sellar una versión de reglas');
  return fallback.valor;
};

export class DecidirLocalmente {
  constructor(
    private readonly cache: CacheDeReglas,
    private readonly opciones: OpcionesDeDecision,
  ) {}

  decidir(hecho: HechoLocal): DecisionLocal {
    const clave = construirClaveIdempotencia({
      copropiedadId: this.opciones.copropiedadId,
      dispositivoId: hecho.dispositivoId,
      origen: hecho.metodo,
      referenciaExterna: hecho.referenciaExterna,
    });
    // Una referencia con caracteres inesperados es un equipo mal configurado.
    // Se deniega y se registra: nunca se «arregla» inventando una clave, que
    // produciría un evento imposible de deduplicar al reconciliar.
    if (esFallo(clave)) {
      return this.contingenciaCon(
        `edge.claveInvalida`,
        null,
        // Sin clave no hay envío posible: se resuelve como fallo técnico y NO
        // se encola. Quien lo encolara crearía un duplicado en cada reintento.
        'FALLO_TECNICO',
        '',
      );
    }

    const instantanea = this.cache.vigente(this.opciones.copropiedadId);
    if (instantanea === null) {
      return this.contingenciaCon('edge.sinCache', null, 'FALLO_TECNICO', clave.valor);
    }
    // Una instantánea a medias —escritura truncada por un corte de luz, formato
    // viejo— no se usa «con lo que se entienda». Sin esta guarda, el primer
    // recorrido sobre una colección ausente lanzaba y tumbaba el gateway: una
    // puerta que deja de abrirse, no una traza en un registro.
    if (!instantaneaUsable(instantanea)) {
      return this.contingenciaCon('edge.cacheIlegible', null, 'FALLO_TECNICO', clave.valor);
    }

    const identidad = resolverIdentidad(instantanea, hecho);
    const contexto = contextoDesde(instantanea, hecho, identidad);
    if (contexto === null) {
      return this.contingenciaCon('edge.cacheIlegible', instantanea, 'FALLO_TECNICO', clave.valor);
    }

    // AQUÍ, y solo aquí, se decide: el motor del dominio, el mismo de la nube.
    const resultado: ResultadoAcceso =
      this.opciones.reglas === undefined
        ? evaluarAcceso(contexto)
        : evaluarAcceso(contexto, this.opciones.reglas);

    return {
      claveIdempotencia: clave.valor,
      resultado,
      cachePotencialmenteObsoleto: this.estaObsoleta(instantanea, hecho.ocurridoEn),
      porContingencia: false,
      requiereEscalamiento: false,
    };
  }

  /**
   * KPI-31 · se mide desde que la NUBE generó la instantánea, no desde que el
   * Edge la recibió. Medir la llegada haría que un gateway que reinicia y
   * recarga su propia caché del disco la diera por fresca, que es justo el caso
   * que hay que poder distinguir.
   */
  private estaObsoleta(instantanea: InstantaneaDeReglas, ahora: Date): boolean {
    const generada = new Date(instantanea.generadaEn).getTime();
    if (Number.isNaN(generada)) return true;
    const minutos = (ahora.getTime() - generada) / 60_000;
    return minutos >= this.opciones.cacheObsoletaMinutos;
  }

  private contingenciaCon(
    reglaAplicada: string,
    instantanea: InstantaneaDeReglas | null,
    motivo: 'FALLO_TECNICO',
    clave: string,
  ): DecisionLocal {
    const version = versionParaContingencia(this.opciones.copropiedadId, instantanea);
    return {
      claveIdempotencia: clave,
      resultado: negar(motivo, version, reglaAplicada),
      // Sin caché no se puede afirmar que las reglas estén frescas.
      cachePotencialmenteObsoleto: true,
      porContingencia: true,
      // `escalar` NO abre la puerta: la pasa a una persona. La diferencia con
      // `denegar` es a quién le toca el siguiente paso, no si se abre.
      requiereEscalamiento: this.opciones.contingencia === 'escalar',
    };
  }
}
