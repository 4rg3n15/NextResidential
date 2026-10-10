/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S5 · DT-15M-C01 · INTERFERENCIAS DETERMINISTAS, A PETICIÓN
 *
 * vitest corre los ficheros EN PARALELO contra UNA base de pruebas que no se
 * recrea entre corridas. Una prueba que mide algo de COP_A —o de la base
 * entera— que otro fichero mueve a la vez, o que la historia de la base va
 * cambiando, pasa o falla según el orden de los ficheros y la edad de la base.
 * Esperar a que el azar lo enseñe no sirve: aquí cada prueba de ese tipo trae
 * la interferencia que la rompería, colocada en SU ventana.
 *
 * Apagadas no hacen nada. `NCR_INTERFERENCIA=<nombre>[,<nombre>…]` —o
 * `todas`— las enciende:
 *
 *   NCR_INTERFERENCIA=todas DATABASE_URL_PRUEBAS=… pnpm --filter @ncr/api test
 *
 * No van encendidas siempre porque algunas dejan huella permanente —una
 * copropiedad más, órdenes fechadas en 2099—: lo mismo que dejarían veinte
 * corridas sin recrear la base, que es justo el estado que la suite tiene que
 * aguantar. Las que no dejan huella van fijas dentro de su prueba (15-S5 T1).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { randomInt } from 'node:crypto';
import { Pool } from 'pg';

const SUPERADMINISTRADOR = '00000000-0000-4000-8000-000000000002';
/** COP_A (MIRA), la copropiedad de la semilla que comparten las suites. */
export const COP_COMPARTIDA = '10000000-0000-4000-8000-000000000001';
/** El autor de lo que «hace otro fichero»: el superadministrador de la semilla. */
export const OTRO_FICHERO = SUPERADMINISTRADOR;

const activas = (): readonly string[] =>
  (process.env['NCR_INTERFERENCIA'] ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');

/** ¿Está encendida la interferencia `nombre`? */
export const interferenciaActiva = (nombre: string): boolean => {
  const lista = activas();
  return lista.includes('todas') || lista.includes(nombre);
};

/** Ejecuta `accion` sólo si la interferencia `nombre` está encendida. */
export const interferir = async (nombre: string, accion: () => Promise<unknown>): Promise<void> => {
  if (interferenciaActiva(nombre)) await accion();
};

/**
 * Lo que hacen a la vez `tablero-pg`, `porteros-por-identificador-pg`, el
 * montaje del DoD o `credencial-vuelve-a-la-nube-pg`: dar de alta una
 * copropiedad. Añade una fila a la lista global y toma un número de
 * `pools_de_porteros_numero_seq`.
 */
export const altaDeCopropiedadAjena = async (superusuario: Pool): Promise<void> => {
  await superusuario.query(
    `INSERT INTO public.copropiedades (nombre, nit, creado_por, actualizado_por)
     VALUES ('Interferencia 15-S5', $1, $2, $2)`,
    [`7${String(randomInt(100_000_000_000)).padStart(11, '0')}`, SUPERADMINISTRADOR],
  );
};

/**
 * Lo que dejan veinte corridas de `salidas-del-videoportero-pg` sin recrear la
 * base: órdenes de COP_A fechadas en 2099, que la tabla no deja borrar. Quien
 * busque la suya entre «las últimas 20» de COP_A ya no la encuentra.
 */
export const ordenesFuturasEnLaCompartida = async (
  superusuario: Pool,
  cuantas: number,
): Promise<void> => {
  await superusuario.query(
    `INSERT INTO public.ordenes_manuales (id, copropiedad_id, accion, motivo, operador_id, rol,
            dispositivo_id, momento, creado_por, actualizado_por)
     SELECT gen_random_uuid(), $1, 'negar', 'Interferencia 15-S5', $2, 'operador_central',
            '90000000-0000-4000-8000-000000000004',
            timestamptz '2099-01-01 00:00:00+00' + n * interval '1 second', $2, $2
       FROM generate_series(1, $3::int) AS n`,
    [COP_COMPARTIDA, OTRO_FICHERO, cuantas],
  );
};

/**
 * Lo que dejan unas treinta corridas sin recrear la base: autorizaciones
 * activas de COP_A que empiezan en el futuro. La lista de la consola trae las
 * 300 de inicio más reciente, y una que empieza ahora deja de salir.
 */
export const autorizacionesFuturasEnLaCompartida = async (
  superusuario: Pool,
  cuantas: number,
): Promise<void> => {
  await superusuario.query(
    `INSERT INTO public.autorizaciones (copropiedad_id, vivienda_id, visitante_id,
            autorizado_por, tipo, vigencia, creado_por, actualizado_por)
     SELECT $1, '30000000-0000-4000-8000-000000000042', '60000000-0000-4000-8000-000000000101',
            '50000000-0000-4000-8000-000000000042', 'unica',
            tstzrange(now() + interval '1 day' + n * interval '1 second',
                      now() + interval '2 days', '[)'), $2, $2
       FROM generate_series(1, $3::int) AS n`,
    [COP_COMPARTIDA, OTRO_FICHERO, cuantas],
  );
};

/**
 * Lo que es una base sembrada hace más de ocho horas: la visita `ABC9999` de la
 * semilla ya venció. Queda así hasta que se recree la base, como en la realidad.
 */
export const semillaVieja = async (url: string): Promise<void> => {
  const superusuario = new Pool({ connectionString: url, max: 1 });
  try {
    await superusuario.query(
      `UPDATE public.autorizaciones
          SET vigencia = tstzrange(now() - interval '9 hours', now() - interval '1 hour', '[)')
        WHERE copropiedad_id = $1 AND placa = 'ABC9999' AND estado = 'activa'`,
      [COP_COMPARTIDA],
    );
  } finally {
    await superusuario.end();
  }
};

/**
 * Una sesión de OTRO fichero parada en un cerrojo, con `texto` en su consulta:
 * lo que ve quien espera «dos sesiones paradas cuyo SQL dice X» contando en
 * `pg_stat_activity` sin mirar de quién son. Devuelve cómo soltarla.
 */
export const sesionAjenaParada = async (
  superusuario: Pool,
  texto: string,
): Promise<() => Promise<void>> => {
  const [duena, parada] = [await superusuario.connect(), await superusuario.connect()];
  const llave = randomInt(1, 2 ** 31 - 1);
  await duena.query('SELECT pg_advisory_lock($1)', [llave]);
  const pid = (await parada.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
  const espera = parada.query(`/* ${texto.replaceAll('*/', '')} */ SELECT pg_advisory_lock($1)`, [
    llave,
  ]);
  for (let i = 0; i < 200; i += 1) {
    const { rows } = await duena.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'",
      [pid],
    );
    if (rows[0]?.n === 1) break;
    await new Promise((listo) => setTimeout(listo, 10));
  }
  return async () => {
    await duena.query('SELECT pg_advisory_unlock($1)', [llave]);
    await espera;
    await parada.query('SELECT pg_advisory_unlock($1)', [llave]);
    duena.release();
    parada.release();
  };
};
