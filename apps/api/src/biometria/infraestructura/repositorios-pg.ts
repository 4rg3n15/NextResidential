import type { Pool, PoolClient } from 'pg';
import { CalidadDeCaptura, ConsentimientoBiometrico, PlantillaBiometrica } from '@ncr/domain-core';
import type {
  CanalConsentimiento,
  EstadoConsentimiento,
  EstadoPlantilla,
  OrigenDeConsentimiento,
} from '@ncr/domain-core';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { EXPONE_MENSAJE } from '../../comun/filtros/error-expuesto';
import type {
  DestinoDePlantilla,
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from '../aplicacion/puertos';
import type { AlmacenDeBytes, ReferenciaDeCifrado } from './boveda-cifrada';
import { conCliente } from '../../persistencia/con-cliente';
import { GUARDAR_CONSENTIMIENTO, parametrosDeConsentimiento } from './consentimiento-sql';
import { INSERTAR_PLANTILLA, parametrosDePlantilla } from './plantilla-sql';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA BIOMETRÍA EN POSTGRESQL · A3, ETAPA 15-E
 *
 * Hasta aquí consentimientos, plantillas y sincronizaciones vivían en memoria
 * en tiempo de ejecución (D-17), y con ello los cerrojos que la ETAPA 08
 * construyó en la base —`tg_plantilla_exige_consentimiento`,
 * `tg_sincronizacion_exige_consentimiento`, `tg_revocacion_suprime_plantillas`,
 * `plantillas_supresion_efectiva`— no actuaban sobre nada. Probados, sí; en
 * uso, no. Esto los pone en el camino.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CLAIMS DE SERVICIO POR LLAMADA, Y POR QUÉ NO LOS DEL USUARIO
 *
 * Las tres tablas admiten escritura SÓLO a la identidad de servicio (0014):
 * ningún token de usuario escribe una plantilla, porque un token de usuario en
 * el navegador es exactamente el sitio donde un vector no debe poder llegar.
 * Por eso cada operación presenta `claimsDeServicio(copropiedadId)`; y por eso
 * el aislamiento de aplicación (`exigirAlcance`, el segundo camino de §2.7.6)
 * ya ocurrió antes de llegar aquí. Quién hizo la operación se conserva igual:
 * va en `creado_por`/`actualizado_por`, que es el actor del contexto.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE LA BASE RECHAZA SE DICE COMO LO QUE ES
 *
 * Un disparador que se niega (`check_violation`) no es un fallo del servidor:
 * es la regla actuando. Se traduce a `RestriccionDeBaseViolada` con el texto
 * del disparador —que nombra la RN— y estado 422, para que el filtro global no
 * lo convierta en un «error interno» que esconde precisamente lo que pasó.
 */
export class RestriccionDeBaseViolada extends Error {
  readonly status = 422;
  /** Marca propia: el filtro global deja salir ESTE mensaje, no el de una dependencia. */
  readonly [EXPONE_MENSAJE] = true;
  constructor(detalle: string) {
    super(detalle);
    this.name = 'RestriccionDeBaseViolada';
  }
}

const CODIGOS_DE_REGLA = new Set(['23514', '23503', '23505', 'P0001']);

const traducir = (error: unknown): never => {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const codigo = String((error as { code: unknown }).code);
    if (CODIGOS_DE_REGLA.has(codigo)) {
      const mensaje = error instanceof Error ? error.message : 'restricción de la base';
      throw new RestriccionDeBaseViolada(mensaje);
    }
  }
  throw error;
};

const conServicio = async <T>(
  pool: Pool,
  copropiedadId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> => {
  return conCliente(pool, async (cliente) => {
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(cliente);
    } catch (error) {
      return traducir(error);
    }
  });
};

// ── Consentimientos ──────────────────────────────────────────────────────────

interface FilaConsentimiento {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly persona_id: string;
  readonly finalidad: string;
  readonly version_politica: string;
  readonly canal: CanalConsentimiento;
  readonly solicitado_en: Date;
  readonly otorgado_en: Date | null;
  readonly revocado_en: Date | null;
  readonly evidencia_id: string | null;
  readonly estado: EstadoConsentimiento;
  readonly origen: OrigenDeConsentimiento;
  readonly declarado_por: string | null;
}

const CAMPOS_CONSENTIMIENTO = `id, copropiedad_id, persona_id, finalidad, version_politica, canal,
  solicitado_en, otorgado_en, revocado_en, evidencia_id, estado, origen, declarado_por`;

const aConsentimiento = (f: FilaConsentimiento): ConsentimientoBiometrico => {
  const r = ConsentimientoBiometrico.solicitar({
    id: f.id,
    copropiedadId: f.copropiedad_id,
    titularId: f.persona_id,
    finalidad: f.finalidad,
    versionPolitica: f.version_politica,
    canal: f.canal,
    solicitadoEn: f.solicitado_en,
    otorgadoEn: f.otorgado_en,
    revocadoEn: f.revocado_en,
    evidenciaId: f.evidencia_id,
    estado: f.estado,
    origen: f.origen,
    declaradoPor: f.declarado_por,
  });
  if (!r.ok) throw new Error(`fila de consentimiento ${f.id} inconsistente: ${r.error.detalle}`);
  return r.valor;
};

export class RepositorioConsentimientosPg implements RepositorioConsentimientos {
  constructor(private readonly pool: Pool) {}

  async porId(copropiedadId: string, id: string): Promise<ConsentimientoBiometrico | null> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<FilaConsentimiento>(
        `SELECT ${CAMPOS_CONSENTIMIENTO} FROM public.consentimientos_biometricos
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aConsentimiento(fila);
    });
  }

  async vigenteDe(
    copropiedadId: string,
    titularId: string,
  ): Promise<ConsentimientoBiometrico | null> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<FilaConsentimiento>(
        `SELECT ${CAMPOS_CONSENTIMIENTO} FROM public.consentimientos_biometricos
          WHERE copropiedad_id = $1 AND persona_id = $2 AND estado = 'vigente' LIMIT 1`,
        [copropiedadId, titularId],
      );
      const fila = rows[0];
      return fila === undefined ? null : aConsentimiento(fila);
    });
  }

  /** Alta o cambio de estado en UNA sentencia: ver `consentimiento-sql.ts`. */
  async guardar(consentimiento: ConsentimientoBiometrico, actorId: string): Promise<void> {
    await conServicio(this.pool, consentimiento.copropiedadId, async (c) => {
      await c.query(GUARDAR_CONSENTIMIENTO, parametrosDeConsentimiento(consentimiento, actorId));
    });
  }
}

// ── Plantillas ───────────────────────────────────────────────────────────────

interface FilaPlantilla {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly persona_id: string;
  readonly consentimiento_id: string;
  readonly autorizacion_id: string | null;
  readonly calidad: string;
  readonly suprimir_en: Date;
  readonly creado_en: Date;
  readonly sincronizada_en: Date | null;
  readonly suprimida_en: Date | null;
  readonly estado: EstadoPlantilla;
}

const CAMPOS_PLANTILLA = `id, copropiedad_id, persona_id, consentimiento_id, autorizacion_id,
  calidad, suprimir_en, creado_en, sincronizada_en, suprimida_en, estado`;

const aPlantilla = (f: FilaPlantilla): PlantillaBiometrica => {
  const calidad = CalidadDeCaptura.crear(Number(f.calidad));
  if (!calidad.ok) throw new Error(`fila de plantilla ${f.id} con calidad inválida`);
  /**
   * El disparador de revocación (0022) acerca `suprimir_en` al instante de la
   * revocación; si ésta ocurrió en el mismo instante de la captura, el
   * agregado —que exige un plazo hacia el futuro— no se reconstruiría. Una
   * fila ya suprimida se rehidrata con el plazo mínimo: lo que importa de ella
   * es que está suprimida, y eso es lo que se conserva.
   */
  const suprimirEn =
    f.estado === 'suprimida' && f.suprimir_en.getTime() <= f.creado_en.getTime()
      ? new Date(f.creado_en.getTime() + 1)
      : f.suprimir_en;
  const r = PlantillaBiometrica.crear({
    id: f.id,
    copropiedadId: f.copropiedad_id,
    titularId: f.persona_id,
    consentimientoId: f.consentimiento_id,
    autorizacionId: f.autorizacion_id,
    calidad: calidad.valor,
    suprimirEn,
    creadoEn: f.creado_en,
    sincronizadaEn: f.sincronizada_en,
    suprimidaEn: f.suprimida_en,
    estado: f.estado,
  });
  if (!r.ok) throw new Error(`fila de plantilla ${f.id} inconsistente: ${r.error.detalle}`);
  return r.valor;
};

export class RepositorioPlantillasPg implements RepositorioPlantillas {
  constructor(private readonly pool: Pool) {}

  private async varias(
    copropiedadId: string,
    condicion: string,
    parametros: readonly unknown[],
  ): Promise<readonly PlantillaBiometrica[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<FilaPlantilla>(
        `SELECT ${CAMPOS_PLANTILLA} FROM public.plantillas_biometricas
          WHERE copropiedad_id = $1 AND ${condicion} ORDER BY creado_en`,
        [copropiedadId, ...parametros],
      );
      return rows.map(aPlantilla);
    });
  }

  async porId(copropiedadId: string, id: string): Promise<PlantillaBiometrica | null> {
    const [fila] = await this.varias(copropiedadId, 'id = $2', [id]);
    return fila ?? null;
  }

  deTitular(copropiedadId: string, titularId: string): Promise<readonly PlantillaBiometrica[]> {
    return this.varias(copropiedadId, 'persona_id = $2', [titularId]);
  }

  deConsentimiento(
    copropiedadId: string,
    consentimientoId: string,
  ): Promise<readonly PlantillaBiometrica[]> {
    return this.varias(copropiedadId, 'consentimiento_id = $2', [consentimientoId]);
  }

  vencidas(copropiedadId: string, ahora: Date): Promise<readonly PlantillaBiometrica[]> {
    return this.varias(copropiedadId, "estado <> 'suprimida' AND suprimir_en <= $2", [ahora]);
  }

  deAutorizacion(
    copropiedadId: string,
    autorizacionId: string,
  ): Promise<readonly PlantillaBiometrica[]> {
    return this.varias(copropiedadId, 'autorizacion_id = $2', [autorizacionId]);
  }

  /**
   * F2 (15-L) · lo que el barrido debe suprimir aunque su plazo no haya
   * llegado: la autorización que la justificaba ya no existe como tal.
   */
  deAutorizacionesRevocadas(copropiedadId: string): Promise<readonly PlantillaBiometrica[]> {
    return this.varias(
      copropiedadId,
      `estado <> 'suprimida' AND autorizacion_id IN (
         SELECT a.id FROM public.autorizaciones a
          WHERE a.copropiedad_id = $1 AND a.estado = 'revocada')`,
      [],
    );
  }

  /** R1 (15-N) · sin suprimir, con consentimiento vigente y que ESE equipo no tiene. */
  async pendientesParaEquipo(
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<readonly string[]> {
    const filas = await this.varias(
      copropiedadId,
      `estado <> 'suprimida' AND vector_cifrado IS NOT NULL
         AND consentimiento_id IN (
           SELECT c.id FROM public.consentimientos_biometricos c
            WHERE c.copropiedad_id = $1 AND c.estado = 'vigente')
         AND id NOT IN (
           SELECT s.plantilla_id FROM public.plantilla_sincronizaciones s
            WHERE s.copropiedad_id = $1 AND s.dispositivo_id = $2 AND s.estado = 'sincronizada')`,
      [dispositivoId],
    );
    return filas.map((p) => p.id);
  }

  /** R1 (15-N) · los equipos que ya tienen la plantilla. */
  async equiposQueLaTienen(
    copropiedadId: string,
    plantillaId: string,
  ): Promise<ReadonlySet<string>> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{ dispositivo_id: string }>(
        `SELECT s.dispositivo_id FROM public.plantilla_sincronizaciones s
          WHERE s.copropiedad_id = $1 AND s.plantilla_id = $2 AND s.estado = 'sincronizada'`,
        [copropiedadId, plantillaId],
      );
      return new Set(rows.map((r) => r.dispositivo_id));
    });
  }

  /** C4 (15-M) · todo lo que el equipo tiene sincronizado, para retirarlo en su baja. */
  async sincronizadasEn(
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<readonly DestinoDePlantilla[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{ plantilla_id: string }>(
        `SELECT s.plantilla_id
           FROM public.plantilla_sincronizaciones s
          WHERE s.copropiedad_id = $1 AND s.dispositivo_id = $2 AND s.estado = 'sincronizada'
          ORDER BY s.creado_en`,
        [copropiedadId, dispositivoId],
      );
      return rows.map((r) => ({ copropiedadId, plantillaId: r.plantilla_id, dispositivoId }));
    });
  }

  /** La cola de CA-10 tal como la define el índice `sincronizaciones_por_retirar_idx`. */
  async porRetirar(copropiedadId: string): Promise<readonly DestinoDePlantilla[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{ plantilla_id: string; dispositivo_id: string }>(
        `SELECT s.plantilla_id, s.dispositivo_id
           FROM public.plantilla_sincronizaciones s
           JOIN public.plantillas_biometricas p ON p.id = s.plantilla_id
          WHERE s.copropiedad_id = $1 AND s.estado = 'sincronizada' AND p.estado = 'suprimida'
          ORDER BY s.creado_en`,
        [copropiedadId],
      );
      return rows.map((r) => ({
        copropiedadId,
        plantillaId: r.plantilla_id,
        dispositivoId: r.dispositivo_id,
      }));
    });
  }

  /**
   * Lo que cambia con el ciclo de vida —estado, plazos, sincronizada,
   * suprimida— se actualiza; lo que identifica la plantilla —titular,
   * consentimiento, autorización, calidad— sólo se escribe al nacer. El vector
   * NO pasa por aquí: lo escribe la bóveda por su propio camino.
   *
   * `suprimir_en` con margen: revocar acerca el plazo al instante presente y
   * el CHECK `plantillas_supresion_acotada` exige que siga siendo POSTERIOR a
   * la creación. En el mismo milisegundo —reloj fijo, o revocación inmediata—
   * serían iguales y la fila no entraría. El `GREATEST` va en los VALUES y no
   * en el `DO UPDATE`: PostgreSQL evalúa el CHECK sobre la fila PROPUESTA
   * antes de detectar el conflicto, así que una propuesta inválida tumba la
   * sentencia aunque fuera a acabar en actualización. Lo enseñó la prueba
   * contra base (`biometria-pg.test.ts`).
   */
  async guardar(plantilla: PlantillaBiometrica, actorId: string): Promise<void> {
    await conServicio(this.pool, plantilla.copropiedadId, async (c) => {
      await c.query(
        `${INSERTAR_PLANTILLA}
         ON CONFLICT (id) DO UPDATE SET
           estado          = EXCLUDED.estado,
           suprimir_en     = EXCLUDED.suprimir_en,
           sincronizada_en = EXCLUDED.sincronizada_en,
           suprimida_en    = EXCLUDED.suprimida_en,
           actualizado_en  = now(),
           actualizado_por = EXCLUDED.actualizado_por`,
        parametrosDePlantilla(plantilla, actorId),
      );
    });
  }

  async suprimirVector(copropiedadId: string, plantillaId: string, actorId: string): Promise<void> {
    await conServicio(this.pool, copropiedadId, async (c) => {
      await c.query(
        `UPDATE public.plantillas_biometricas
            SET vector_cifrado = NULL, llave_ref = NULL, algoritmo = NULL,
                actualizado_en = now(), actualizado_por = $3
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, plantillaId, actorId],
      );
    });
  }

  /**
   * La fila por (plantilla, dispositivo) es ÚNICA (`sincronizaciones_uk`): un
   * reintento no duplica, cuenta. Y el disparador de 0022 la rechaza si el
   * consentimiento ya no está vigente — aquí no se comprueba dos veces.
   */
  async registrarSincronizacion(destino: DestinoDePlantilla, actorId: string): Promise<void> {
    await conServicio(this.pool, destino.copropiedadId, async (c) => {
      await c.query(
        `INSERT INTO public.plantilla_sincronizaciones
           (copropiedad_id, plantilla_id, dispositivo_id, estado, intentos, sincronizada_en,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, 'sincronizada', 1, now(), $4, $4)
         ON CONFLICT (plantilla_id, dispositivo_id) DO UPDATE SET
           estado          = 'sincronizada',
           intentos        = public.plantilla_sincronizaciones.intentos + 1,
           ultimo_error    = NULL,
           sincronizada_en = now(),
           suprimida_en    = NULL,
           actualizado_en  = now(),
           actualizado_por = EXCLUDED.actualizado_por`,
        [destino.copropiedadId, destino.plantillaId, destino.dispositivoId, actorId],
      );
    });
  }

  /**
   * `fallida` con su motivo y un intento más. El `WHERE` del conflicto es la
   * regla: una fila `sincronizada` no se pisa (el equipo ya la tiene y la cola
   * de retirada depende de ese estado).
   */
  async registrarFallo(
    destino: DestinoDePlantilla,
    detalle: string,
    actorId: string,
  ): Promise<void> {
    await conServicio(this.pool, destino.copropiedadId, async (c) => {
      await c.query(
        `INSERT INTO public.plantilla_sincronizaciones
           (copropiedad_id, plantilla_id, dispositivo_id, estado, intentos, ultimo_error,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, 'fallida', 1, $4, $5, $5)
         ON CONFLICT (plantilla_id, dispositivo_id) DO UPDATE SET
           estado          = 'fallida',
           intentos        = public.plantilla_sincronizaciones.intentos + 1,
           ultimo_error    = EXCLUDED.ultimo_error,
           actualizado_en  = now(),
           actualizado_por = EXCLUDED.actualizado_por
         WHERE public.plantilla_sincronizaciones.estado <> 'sincronizada'`,
        [
          destino.copropiedadId,
          destino.plantillaId,
          destino.dispositivoId,
          detalle.slice(0, 500),
          actorId,
        ],
      );
    });
  }

  async registrarRetirada(destino: DestinoDePlantilla, actorId: string): Promise<void> {
    await conServicio(this.pool, destino.copropiedadId, async (c) => {
      await c.query(
        `UPDATE public.plantilla_sincronizaciones
            SET estado = 'suprimida', suprimida_en = now(),
                actualizado_en = now(), actualizado_por = $4
          WHERE copropiedad_id = $1 AND plantilla_id = $2 AND dispositivo_id = $3`,
        [destino.copropiedadId, destino.plantillaId, destino.dispositivoId, actorId],
      );
    });
  }
}

// ── El sobre cifrado, en la fila de la plantilla ─────────────────────────────

/**
 * El vector cifrado vive en `plantillas_biometricas.vector_cifrado` (D-10: se
 * cifra en la aplicación, la base guarda bytes sin sentido). Lo que se persiste
 * junto a él es la REFERENCIA de la llave, que el CHECK
 * `plantillas_llave_es_referencia` obliga a que sea eso y no la llave.
 *
 * `poner` exige que la fila exista: la captura guarda primero la plantilla y
 * después el sobre, y un sobre sin fila sería un vector sin consentimiento al
 * que responder (RN-09).
 */
export class AlmacenDeBytesPg implements AlmacenDeBytes {
  constructor(private readonly pool: Pool) {}

  async poner(
    copropiedadId: string,
    plantillaId: string,
    datos: Buffer,
    referencia: ReferenciaDeCifrado,
  ): Promise<void> {
    await conServicio(this.pool, copropiedadId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.plantillas_biometricas
            SET vector_cifrado = $3, llave_ref = $4, algoritmo = $5, actualizado_en = now()
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, plantillaId, datos, referencia.llaveRef, referencia.algoritmo],
      );
      if (rowCount !== 1) {
        throw new Error(
          `No hay fila de plantilla ${plantillaId} donde guardar el sobre: la plantilla se ` +
            'escribe ANTES que su vector (RN-09)',
        );
      }
    });
  }

  async tomar(copropiedadId: string, plantillaId: string): Promise<Buffer | null> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{ vector_cifrado: Buffer | null }>(
        `SELECT vector_cifrado FROM public.plantillas_biometricas
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, plantillaId],
      );
      return rows[0]?.vector_cifrado ?? null;
    });
  }

  async quitar(copropiedadId: string, plantillaId: string): Promise<void> {
    await conServicio(this.pool, copropiedadId, async (c) => {
      await c.query(
        `UPDATE public.plantillas_biometricas
            SET vector_cifrado = NULL, llave_ref = NULL, algoritmo = NULL, actualizado_en = now()
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, plantillaId],
      );
    });
  }
}
