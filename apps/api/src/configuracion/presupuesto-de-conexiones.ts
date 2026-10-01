/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-O · EL PRESUPUESTO DE CONEXIONES CONTRA EL POOLER DE SUPABASE
 *
 * En sitio (30/09/2026) la API abría hasta 20 conexiones (`PG_POOL_MAX`) más
 * las de pg-boss más la de la sonda de `/ready`, contra un pooler en modo
 * SESIÓN que en el plan gratuito admite quince clientes [SUPUESTO S-170: el
 * valor real está en el panel, Database → Settings → Connection pooling →
 * «Pool Size»]. Con el volcado histórico de un equipo llenando el pool, el
 * pooler empezó a rechazar y a cortar: es el disparo del corte que tumbó la API.
 *
 * La regla: `PG_POOL_MAX` + (`PGBOSS_POOL_MAX` si el planificador está
 * habilitado) ≤ `SUPABASE_POOLER_MAX_CLIENTES`. La sonda ya no suma: desde la
 * 15-O usa el pool de la API. Es conservadora si el pool de la API va por el
 * pooler de TRANSACCIÓN (:6543), que admite más clientes; se prefiere eso a
 * descubrir el límite en sitio.
 *
 * `pnpm sitio:ensayo` aplica LA MISMA regla (`juzgarPresupuestoDeConexiones`,
 * en `@ncr/providers`) y una prueba comprueba que las dos coinciden.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface EntradasDelPresupuesto {
  readonly PG_POOL_MAX: number;
  readonly PGBOSS_POOL_MAX: number;
  readonly PLANIFICADOR_HABILITADO: boolean;
  readonly SUPABASE_POOLER_MAX_CLIENTES: number;
}

export interface PresupuestoDeConexiones {
  readonly api: number;
  readonly pgboss: number;
  readonly total: number;
  readonly limite: number;
  readonly excede: boolean;
}

export const presupuestoDeConexiones = (c: EntradasDelPresupuesto): PresupuestoDeConexiones => {
  const pgboss = c.PLANIFICADOR_HABILITADO ? c.PGBOSS_POOL_MAX : 0;
  const total = c.PG_POOL_MAX + pgboss;
  return {
    api: c.PG_POOL_MAX,
    pgboss,
    total,
    limite: c.SUPABASE_POOLER_MAX_CLIENTES,
    excede: total > c.SUPABASE_POOLER_MAX_CLIENTES,
  };
};

/** El problema en palabras, con los números y qué cambiar. `null` si cabe. */
export const problemaDelPresupuesto = (c: EntradasDelPresupuesto): string | null => {
  const p = presupuestoDeConexiones(c);
  if (!p.excede) return null;
  return (
    `presupuesto de conexiones excedido: PG_POOL_MAX (${String(p.api)}) + PGBOSS_POOL_MAX ` +
    `(${String(p.pgboss)}) = ${String(p.total)} > SUPABASE_POOLER_MAX_CLIENTES ` +
    `(${String(p.limite)}). Con el pooler lleno, Supabase rechaza y corta conexiones: ` +
    'baje PG_POOL_MAX, o suba SUPABASE_POOLER_MAX_CLIENTES al «Pool Size» real del panel'
  );
};
