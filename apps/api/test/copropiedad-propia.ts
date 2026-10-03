import { randomInt, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ContextoTenant } from '../src/autenticacion';
import type { RepositorioDeEquipos, ResultadoDeSondeo } from '../src/equipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA COPROPIEDAD PROPIA, CON SU ADMINISTRADOR, PARA LO QUE CUENTA O DA DE ALTA
 *
 * H-15M-C01 · «una alerta archivada deja de contar como pendiente»
 * (`tablero-pg.test.ts`, 15-M) medía `antes + 1` sobre las alertas pendientes
 * de COP_A, la copropiedad de la semilla. vitest corre los ficheros EN
 * PARALELO contra la misma base, y `persistencia-operativa-pg.test.ts` abre y
 * resuelve alertas en COP_A a la vez: una abierta antes de la primera lectura
 * y resuelta entre las dos dejaba el conteo igual (CI, `2980cf8`: «expected 73
 * to be 74»). «Al menos» no lo arregla: con vecinos que también restan, «≥»
 * deja de demostrar que lo archivado no cuenta.
 *
 * Una copropiedad que nace en la prueba no tiene vecinos, y su conteo es
 * exacto: 0, 1 al guardar, 0 al archivar. Por lo mismo se da de alta aquí lo
 * de «aparece en Dispositivos» (H-15M-C02): cada corrida dejaba en COP_A dos
 * equipos activos para siempre, y `dispositivos_endpoint_uk` —único por
 * copropiedad, host y puerto— acababa chocando con los de una anterior.
 *
 * UNA por corrida, no una por prueba: cada alta toma un número de
 * `pools_de_porteros_numero_seq` y añade una fila a la lista global, y dos
 * suites miran justo eso mientras ésta corre —`porteros-por-identificador-pg`
 * espera números consecutivos y `copropiedades-pg`, la misma lista en dos
 * lecturas—. Cuantas menos altas, menos se las perturba.
 *
 * El escenario lo monta el superusuario de la base de pruebas, como en
 * `porteros-por-identificador-pg` y en el montaje del DoD del puente: no es lo
 * que se prueba. Lo probado —tablero, alertas y equipos— sigue con el rol de
 * la API, la RLS forzada y un administrador DE ESTA copropiedad, no el de
 * COP_A con otra copropiedad en los claims.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SUPERADMINISTRADOR = '00000000-0000-4000-8000-000000000002';

export interface CopropiedadPropia {
  readonly id: string;
  /** Su administrador: el que da de alta y lista sus equipos. */
  readonly ctx: ContextoTenant;
}

const primera = (filas: readonly { id: string }[], que: string): string => {
  const id = filas[0]?.id;
  if (id === undefined) throw new Error(`el alta de ${que} no devolvió fila`);
  return id;
};

const crear = async (superusuario: Pool, sufijo: string): Promise<CopropiedadPropia> => {
  // `copropiedades_nit_uk`: doce cifras al azar, y ninguna suite que derive el
  // NIT de la hora (diez u once cifras) puede dar el mismo.
  const nit = `6${String(randomInt(100_000_000_000)).padStart(11, '0')}`;
  const cop = await superusuario.query<{ id: string }>(
    `INSERT INTO public.copropiedades (nombre, nit, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [`Copropiedad propia ${sufijo}`, nit, SUPERADMINISTRADOR],
  );
  const id = primera(cop.rows, 'la copropiedad');
  const usuario = await superusuario.query<{ id: string }>(
    `INSERT INTO public.usuarios (copropiedad_id, auth_user_id, correo, nombre,
                                  creado_por, actualizado_por)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
    [
      id,
      randomUUID(),
      `admin-${randomUUID()}@propia.invalid`,
      `Admin ${sufijo}`,
      SUPERADMINISTRADOR,
    ],
  );
  const usuarioId = primera(usuario.rows, 'su administrador');
  await superusuario.query(
    `INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
     VALUES ($1, $2, 'administrador', $3, $3)`,
    [id, usuarioId, SUPERADMINISTRADOR],
  );
  return {
    id,
    ctx: {
      usuarioId,
      rol: 'administrador',
      copropiedadId: id,
      copropiedadesAtendidas: [],
      mfaVerificado: true,
    },
  };
};

const porCorrida = new Map<string, Promise<CopropiedadPropia>>();

/** La de esta corrida: la primera llamada la crea y las siguientes la reutilizan. */
export const copropiedadDeLaCorrida = (
  superusuario: Pool,
  corrida: string,
): Promise<CopropiedadPropia> => {
  const ya = porCorrida.get(corrida);
  if (ya !== undefined) return ya;
  const nueva = crear(superusuario, corrida);
  porCorrida.set(corrida, nueva);
  return nueva;
};

/** Sin sondear: el equipo existe para que una alerta tenga de quién ser. */
const SIN_SONDEO: ResultadoDeSondeo = {
  clase: 'alcanzado',
  detalle: 'no se probó',
  modelo: null,
  firmware: null,
  latenciaMs: 0,
  verificado: false,
};

/** Un equipo de la copropiedad, dado de alta por su administrador. */
export const equipoPropio = async (
  equipos: Pick<RepositorioDeEquipos, 'crear'>,
  propia: CopropiedadPropia,
  sufijo: string,
): Promise<string> => {
  const equipo = await equipos.crear(
    propia.ctx,
    propia.id,
    {
      nombre: `Cámara ${sufijo}`,
      tipo: 'camara_lpr',
      host: '192.0.2.10',
      puerto: 80,
      protocolo: 'http',
      usuario: 'servicio',
      secreto: `clave-${sufijo}`,
    },
    SIN_SONDEO,
  );
  return equipo.id;
};
