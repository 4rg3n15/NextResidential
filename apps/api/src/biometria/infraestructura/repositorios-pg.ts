import type { Pool, PoolClient } from 'pg';
import { CalidadDeCaptura, ConsentimientoBiometrico, PlantillaBiometrica } from '@ncr/domain-core';
import type { CanalConsentimiento, EstadoConsentimiento, EstadoPlantilla } from '@ncr/domain-core';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { EXPONE_MENSAJE } from '../../comun/filtros/error-expuesto';
import type {
  DestinoDePlantilla,
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from '../aplicacion/puertos';
import type { AlmacenDeBytes, ReferenciaDeCifrado } from './boveda-cifrada';

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
  const cliente = await pool.connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(copropiedadId)),
    ]);
    return await fn(cliente);
  } catch (error) {
    return traducir(error);
  } finally {
    cliente.release();
  }
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
}

const CAMPOS_CONSENTIMIENTO = `id, copropiedad_id, persona_id, finalidad, version_politica, canal,
  solicitado_en, otorgado_en, revocado_en, evidencia_id, estado`;

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

  async pendientesVencidos(
    copropiedadId: string,
    ahora: Date,
    plazoHoras: number,
  ): Promise<readonly ConsentimientoBiometrico[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<FilaConsentimiento>(
        `SELECT ${CAMPOS_CONSENTIMIENTO} FROM public.consentimientos_biometricos
          WHERE copropiedad_id = $1 AND estado = 'pendiente'
            AND solicitado_en <= $2::timestamptz - ($3::numeric * interval '1 hour')
          ORDER BY solicitado_en`,
        [copropiedadId, ahora, plazoHoras],
      );
      return rows.map(aConsentimiento);
    });
  }

  /**
   * Alta o cambio de estado en UNA sentencia: la fila nace `pendiente` en la
   * captura y la misma llamada la lleva a `vigente`, `rechazado`, `revocado` o
   * `expirado`. Lo que NO cambia nunca tras nacer —titular, finalidad, versión,
   * canal, solicitado_en— no está en el `UPDATE`, así que tampoco puede
   * cambiar por un descuido del llamador.
   */
  async guardar(consentimiento: ConsentimientoBiometrico, actorId: string): Promise<void> {
    await conServicio(this.pool, consentimiento.copropiedadId, async (c) => {
      await c.query(
        `INSERT INTO public.consentimientos_biometricos
           (id, copropiedad_id, persona_id, finalidad, version_politica, canal, solicitado_en,
            otorgado_en, revocado_en, evidencia_id, estado, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
         ON CONFLICT (id) DO UPDATE SET
           otorgado_en     = EXCLUDED.otorgado_en,
           revocado_en     = EXCLUDED.revocado_en,
           evidencia_id    = EXCLUDED.evidencia_id,
           estado          = EXCLUDED.estado,
           actualizado_en  = now(),
           actualizado_por = EXCLUDED.actualizado_por`,
        [
          consentimiento.id,
          consentimiento.copropiedadId,
          consentimiento.titularId,
          consentimiento.finalidad,
          consentimiento.versionPolitica,
          consentimiento.canal,
          consentimiento.solicitadoEn,
          consentimiento.otorgadoEn,
          consentimiento.revocadoEn,
          consentimiento.evidenciaId,
          consentimiento.estado,
          actorId,
        ],
      );
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
        `INSERT INTO public.plantillas_biometricas
           (id, copropiedad_id, persona_id, consentimiento_id, autorizacion_id, calidad,
            suprimir_en, creado_en, sincronizada_en, suprimida_en, estado,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6,
                 GREATEST($7::timestamptz, $8::timestamptz + interval '1 millisecond'),
                 $8, $9, $10, $11, $12, $12)
         ON CONFLICT (id) DO UPDATE SET
           estado          = EXCLUDED.estado,
           suprimir_en     = EXCLUDED.suprimir_en,
           sincronizada_en = EXCLUDED.sincronizada_en,
           suprimida_en    = EXCLUDED.suprimida_en,
           actualizado_en  = now(),
           actualizado_por = EXCLUDED.actualizado_por`,
        [
          plantilla.id,
          plantilla.copropiedadId,
          plantilla.titularId,
          plantilla.consentimientoId,
          plantilla.autorizacionId,
          plantilla.calidad.valor,
          plantilla.suprimirEn,
          plantilla.creadoEn,
          plantilla.sincronizadaEn,
          plantilla.suprimidaEn,
          plantilla.estado,
          actorId,
        ],
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
