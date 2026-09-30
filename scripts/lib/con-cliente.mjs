/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-O · EL PRÉSTAMO DE UN CLIENTE, PARA LOS GUIONES DEL OPERADOR
 *
 * Gemelo de `apps/api/src/persistencia/con-cliente.ts` para lo que corre con
 * `node` a pelo (`pnpm sitio:ensayo`): un `.mjs` no puede importar el `.ts` de
 * la API con el Node que `engines` admite (≥ 22.11, sin eliminación de tipos).
 * Es el ÚNICO sitio de `scripts/` que presta un cliente; el control
 * `frontera-conexiones.mjs` lo exige.
 *
 * Mientras el cliente está prestado, un oyente de `'error'` anota el corte: sin
 * él, `pg` lo emite sin nadie escuchando y Node termina el proceso —lo que tumbó
 * la API en sitio el 30/09/2026—. Al devolverlo con la conexión rota,
 * `release(corte)` hace que el pool la DESCARTE en vez de prestarla otra vez.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const conCliente = async (pool, fn) => {
  const cliente = await pool.connect();
  let corte;
  const oyente = (error) => {
    corte = error;
  };
  cliente.on('error', oyente);
  try {
    return await fn(cliente);
  } finally {
    cliente.off('error', oyente);
    cliente.release(corte);
  }
};
