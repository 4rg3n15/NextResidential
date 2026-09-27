/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo` · LO QUE EL ENSAYO PREGUNTA A LA PLATAFORMA (J1, 15-L)
 *
 * Preguntas, todas de sólo lectura:
 *
 *  · ¿Contesta la API en el bucle local y POR LA IP DEL MAC? La segunda es la
 *    del iPhone: si el Mac no la contesta, la app tampoco podrá (E3).
 *  · ¿Faltan migraciones por aplicar (`supabase db push`)?
 *  · ¿Llegó el evento de este equipo desde que se pidió el gesto? Se busca por
 *    el host del equipo en `dispositivos` y en `eventos_de_equipo`/`eventos`.
 *  · F2 · ¿cuánto tardaron los veredictos que la API devolvió a la terminal?
 *  · F3 · ¿hay equipos reales dados de alta (activos y con usuario de servicio)?
 *
 * La RLS está FORZADA también para el dueño de las tablas (ADR-05), así que la
 * lectura lleva claims, como la API: los de superadministrador, dentro de una
 * transacción de SÓLO LECTURA. Es una herramienta del operador en su Mac, no
 * una ruta de la API.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { readdirSync } from 'node:fs';

const CLAIMS_DE_LECTURA = JSON.stringify({ rol: 'superadministrador' });

/** Una lectura con claims, en una transacción que no puede escribir. */
const leer = async (pool, sql, parametros) => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN READ ONLY');
    await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS_DE_LECTURA]);
    const { rows } = await cliente.query(sql, parametros);
    await cliente.query('COMMIT');
    return rows;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
};

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * El puerto `EventosDeLaPlataforma` del ensayo: sondea cada segundo hasta el
 * plazo. Un acceso de `eventos` cuenta igual que un evento de equipo.
 */
export const eventosDeLaPlataforma = (pool, { intervaloMs = 1000 } = {}) => ({
  primeroDesde: async (host, desde, plazoMs) => {
    const limite = Date.now() + plazoMs;
    for (;;) {
      const filas = await leer(
        pool,
        `SELECT titulo, ocurrido_en FROM (
           SELECT e.titulo, e.recibido_en AS ocurrido_en
             FROM public.eventos_de_equipo e
             JOIN public.dispositivos d
               ON d.id = e.dispositivo_id AND d.copropiedad_id = e.copropiedad_id
            WHERE d.host = $1 AND e.en_vivo AND e.recibido_en >= $2
           UNION ALL
           SELECT 'Intento de acceso' || COALESCE(' · ' || v.resultado::text, ''), v.registrado_en
             FROM public.eventos v
             JOIN public.dispositivos d
               ON d.id = v.dispositivo_id AND d.copropiedad_id = v.copropiedad_id
            WHERE d.host = $1 AND v.registrado_en >= $2
         ) x
         ORDER BY ocurrido_en
         LIMIT 1`,
        [host, desde],
      );
      const fila = filas[0];
      if (fila !== undefined)
        return { titulo: fila.titulo, ocurridoEn: new Date(fila.ocurrido_en) };
      if (Date.now() >= limite) return null;
      await esperar(Math.min(intervaloMs, Math.max(0, limite - Date.now())));
    }
  },
});

/**
 * F2 (corrección de la 15-L) · el puerto `VerificacionesDeLaPlataforma`: los
 * veredictos que la API devolvió a este equipo desde `desde`. Los registra en
 * `eventos_de_equipo` (migración 0040) con `tipo = 'resultado_de_verificacion'`
 * y, en `carga`, `duracionMs` (del hecho recibido al veredicto) y
 * `aceptadoPorElEquipo`. Sondea hasta tener `cuantas` o agotar el plazo.
 */
export const verificacionesDeLaPlataforma = (pool, { intervaloMs = 1000 } = {}) => ({
  medidasDesde: async (host, desde, cuantas, plazoMs) => {
    const limite = Date.now() + plazoMs;
    for (;;) {
      const filas = await leer(
        pool,
        `SELECT (e.carga->>'duracionMs')::float8 AS duracion_ms,
                CASE WHEN jsonb_typeof(e.carga->'aceptadoPorElEquipo') = 'boolean'
                     THEN (e.carga->>'aceptadoPorElEquipo')::boolean END AS aceptado
           FROM public.eventos_de_equipo e
           JOIN public.dispositivos d
             ON d.id = e.dispositivo_id AND d.copropiedad_id = e.copropiedad_id
          WHERE d.host = $1 AND e.tipo = 'resultado_de_verificacion'
            AND jsonb_typeof(e.carga->'duracionMs') = 'number' AND e.recibido_en >= $2
          ORDER BY e.recibido_en
          LIMIT $3`,
        [host, desde, cuantas],
      );
      const medidas = filas.map((f) => ({
        duracionMs: Number(f.duracion_ms),
        aceptado: typeof f.aceptado === 'boolean' ? f.aceptado : null,
      }));
      if (medidas.length >= cuantas || Date.now() >= limite) return medidas;
      await esperar(Math.min(intervaloMs, Math.max(0, limite - Date.now())));
    }
  },
});

/**
 * F3 (corrección de la 15-L) · cuántos equipos REALES hay dados de alta: activos
 * y con usuario de servicio, que es lo que el registro de la API exige para
 * hablar con ellos (`registro-de-equipos-pg.ts`). Los del seed no llevan usuario.
 * `[SUPUESTO]` S-104: «real» = activo y con usuario. El sobre de la credencial
 * no se mira: su política sólo admite los claims de SERVICIO de cada
 * copropiedad, y el ensayo lee con los de superadministrador.
 */
export const equiposRealesRegistrados = async (pool) => {
  const filas = await leer(
    pool,
    `SELECT count(*)::int AS n FROM public.dispositivos
      WHERE estado = 'activo' AND usuario IS NOT NULL`,
    [],
  );
  return Number(filas[0]?.n ?? 0);
};

/** ¿Está este host dado de alta en la consola? Sin eso el evento no puede llegar. */
export const equipoRegistrado = async (pool, host) => {
  const filas = await leer(
    pool,
    `SELECT d.nombre, c.nombre AS copropiedad
       FROM public.dispositivos d JOIN public.copropiedades c ON c.id = d.copropiedad_id
      WHERE d.host = $1 AND d.estado = 'activo'`,
    [host],
  );
  return filas.map((f) => ({ nombre: f.nombre, copropiedad: f.copropiedad }));
};

/**
 * Las migraciones del repositorio que la base aún no tiene. `null` si la base
 * no lleva el registro de la CLI (una base local de pruebas, por ejemplo).
 */
export const migracionesPendientes = async (pool, carpeta) => {
  const locales = readdirSync(carpeta)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .map((f) => ({ version: f.slice(0, 14), fichero: f }));
  let aplicadas;
  try {
    const { rows } = await pool.query('SELECT version FROM supabase_migrations.schema_migrations');
    aplicadas = new Set(rows.map((r) => String(r.version)));
  } catch {
    return null;
  }
  return locales.filter((l) => !aplicadas.has(l.version)).map((l) => l.fichero);
};

/** `GET <url>/health` con plazo. Distingue «no contesta» de «contesta mal». */
export const sondearSalud = async (url, plazoMs = 3000) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(plazoMs) });
    return { alcanzada: true, ok: r.ok, estado: r.status };
  } catch (error) {
    return {
      alcanzada: false,
      ok: false,
      estado: null,
      motivo: error?.name === 'TimeoutError' ? 'sin respuesta' : 'conexión rechazada',
    };
  }
};
