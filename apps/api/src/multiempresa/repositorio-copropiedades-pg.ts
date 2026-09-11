import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ContextoTenant } from '../autenticacion';
import type { CopropiedadResumen, RepositorioCopropiedades } from './repositorio-copropiedades';
import { filtrarPorAlcance } from './repositorio-copropiedades';
import type {
  CambiosDeConfiguracion,
  ConfiguracionDeCopropiedad,
  PoliticaContingencia,
} from './configuracion';
import { cambiosEfectivos, resumenDeCambios } from './configuracion';

/** `interval` de PostgreSQL → horas y minutos, sin depender del formato de texto. */
interface FilaDeConfiguracion {
  readonly nombre: string;
  readonly zona_horaria: string;
  readonly umbral_confianza_placa: string;
  readonly politica_contingencia_edge: PoliticaContingencia;
  readonly latido_minutos: string;
  readonly nit: string;
  readonly estado: string;
  readonly consentimiento_horas: string;
  readonly cache_horas: string;
  readonly version_reglas_actual: string;
}

const aConfiguracion = (f: FilaDeConfiguracion): ConfiguracionDeCopropiedad => ({
  nombre: f.nombre,
  zonaHoraria: f.zona_horaria,
  umbralConfianzaPlaca: Number(f.umbral_confianza_placa),
  politicaContingenciaEdge: f.politica_contingencia_edge,
  umbralLatidoMinutos: Math.round(Number(f.latido_minutos)),
  nit: f.nit,
  estado: f.estado,
  plazoConsentimientoHoras: Number(f.consentimiento_horas),
  margenCacheReglasHoras: Number(f.cache_horas),
  versionReglasActual: Number(f.version_reglas_actual),
});

/**
 * Las horas y los minutos salen de `EXTRACT(EPOCH FROM …)` y no del texto del
 * `interval`. PostgreSQL imprime «1 day» y «24:00:00» según el ajuste
 * `IntervalStyle` de la sesión, que no controlamos: parsear ese texto es
 * exactamente el tipo de dependencia que falla en otra máquina y no aquí.
 */
const CAMPOS_DE_CONFIGURACION = `
       nombre,
       zona_horaria,
       umbral_confianza_placa,
       politica_contingencia_edge,
       EXTRACT(EPOCH FROM umbral_latido_dispositivo) / 60 AS latido_minutos,
       nit,
       estado::text AS estado,
       EXTRACT(EPOCH FROM plazo_consentimiento) / 3600 AS consentimiento_horas,
       EXTRACT(EPOCH FROM margen_cache_reglas)   / 3600 AS cache_horas,
       version_reglas_actual`;

/**
 * Catálogo de copropiedades contra PostgreSQL, **por los dos caminos de
 * §2.7.6**.
 *
 * 1. Fija `request.jwt.claims` en la MISMA conexión que ejecuta la consulta, de
 *    modo que la política `copropiedades_lectura` decide qué filas existen.
 *    Para el superadministrador eso es `app.es_superadmin()`, que es
 *    exactamente lo que hace que su alcance sea global sin pertenecer a
 *    ninguna.
 * 2. Vuelve a filtrar en la aplicación con `filtrarPorAlcance`. No es
 *    desconfianza de la RLS: es que la llave secreta la OMITE, y este mismo
 *    repositorio podría cablearse un día bajo esa llave. Con el filtro, el peor
 *    caso es una lista de menos, nunca de más.
 *
 * Si los dos caminos discrepasen, la intersección es lo que sale. Es la
 * respuesta conservadora y no hay ninguna en la que convenga la contraria.
 */
@Injectable()
export class RepositorioCopropiedadesPg implements RepositorioCopropiedades {
  constructor(private readonly pool: Pool) {}

  private claimsDe(ctx: ContextoTenant): Record<string, unknown> {
    return {
      rol: ctx.rol,
      usuario_id: ctx.usuarioId,
      // La RLS lee este campo; en el superadministrador va nulo a propósito y
      // `app.es_superadmin()` es quien concede.
      copropiedad_id: ctx.copropiedadId,
      copropiedades: ctx.copropiedadesAtendidas,
    };
  }

  async listarParaElAlcance(ctx: ContextoTenant): Promise<readonly CopropiedadResumen[]> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claimsDe(ctx)),
      ]);
      const { rows } = await cliente.query<{
        id: string;
        nombre: string;
        zona_horaria: string;
      }>(
        `SELECT id, nombre, zona_horaria
           FROM public.copropiedades
          WHERE estado = 'activa'
          ORDER BY nombre ASC`,
      );
      const leidas = rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        zonaHoraria: r.zona_horaria,
      }));
      return filtrarPorAlcance(ctx, leidas);
    } finally {
      cliente.release();
    }
  }

  async leerConfiguracion(
    ctx: ContextoTenant,
    id: string,
  ): Promise<ConfiguracionDeCopropiedad | null> {
    // Segundo camino de §2.7.6 ANTES de consultar: la llave secreta omite la
    // RLS, así que el alcance se comprueba también aquí.
    if (!filtrarPorAlcance(ctx, await this.listarParaElAlcance(ctx)).some((c) => c.id === id)) {
      return null;
    }
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claimsDe(ctx)),
      ]);
      const { rows } = await cliente.query<FilaDeConfiguracion>(
        `SELECT ${CAMPOS_DE_CONFIGURACION} FROM public.copropiedades WHERE id = $1`,
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aConfiguracion(fila);
    } finally {
      cliente.release();
    }
  }

  /**
   * El cambio y su registro de auditoría, en **una sola transacción**.
   *
   * Si el registro se escribiera después del `UPDATE`, una caída entre los dos
   * dejaría un cambio de configuración sin rastro. §2.7.8 no admite esa
   * ventana, y con `BEGIN … COMMIT` no existe: o se guardan los dos o ninguno.
   *
   * Todas las asignaciones son **parametrizadas** (§2.7.4): los nombres de
   * columna salen de un mapa cerrado en el código y los valores van por
   * marcador, así que no hay forma de concatenar entrada del usuario en el SQL.
   */
  async guardarConfiguracion(
    ctx: ContextoTenant,
    id: string,
    cambios: CambiosDeConfiguracion,
  ): Promise<ConfiguracionDeCopropiedad | null> {
    const actual = await this.leerConfiguracion(ctx, id);
    if (actual === null) return null;

    const efectivos = cambiosEfectivos(actual, cambios);
    if (Object.keys(efectivos).length === 0) return actual;

    const COLUMNA: Readonly<Record<string, string>> = {
      nombre: 'nombre = $#',
      zonaHoraria: 'zona_horaria = $#',
      umbralConfianzaPlaca: 'umbral_confianza_placa = $#',
      politicaContingenciaEdge: 'politica_contingencia_edge = $#::politica_contingencia',
      umbralLatidoMinutos: 'umbral_latido_dispositivo = make_interval(mins => $#)',
    };

    const asignaciones: string[] = [];
    const valores: (string | number)[] = [];
    for (const [clave, valor] of Object.entries(efectivos)) {
      const plantilla = COLUMNA[clave];
      if (plantilla === undefined || valor === undefined) continue;
      valores.push(valor);
      asignaciones.push(plantilla.replace('$#', `$${String(valores.length)}`));
    }

    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claimsDe(ctx)),
      ]);
      await cliente.query('BEGIN');
      try {
        valores.push(ctx.usuarioId);
        const marcadorActor = `$${String(valores.length)}`;
        valores.push(id);
        const marcadorId = `$${String(valores.length)}`;

        const { rows } = await cliente.query<FilaDeConfiguracion>(
          `UPDATE public.copropiedades
              SET ${asignaciones.join(', ')}, actualizado_por = ${marcadorActor}
            WHERE id = ${marcadorId}
        RETURNING ${CAMPOS_DE_CONFIGURACION}`,
          valores,
        );
        const fila = rows[0];
        if (fila === undefined) {
          // La RLS no dejó tocar la fila. No es un error del servidor: es la
          // misma respuesta que una copropiedad que no existe (404), porque un
          // 403 confirmaría que el identificador es real.
          await cliente.query('ROLLBACK');
          return null;
        }

        await cliente.query(
          `INSERT INTO public.auditoria_seguridad
             (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo,
              recurso, identificador_solicitado, resultado, creado_por)
           VALUES ($1, $2, $3, 'cambio_configuracion', $4, $5, 'permitido', $3)`,
          [
            ctx.copropiedadId,
            id,
            ctx.usuarioId,
            `copropiedades/${id}/configuracion`,
            resumenDeCambios(actual, efectivos).slice(0, 300),
          ],
        );

        await cliente.query('COMMIT');
        return aConfiguracion(fila);
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      }
    } finally {
      cliente.release();
    }
  }
}
