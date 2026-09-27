/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo -- --capturar | --restaurar` · J2 (15-L)
 *
 * El respaldo de la configuración de cada equipo ANTES de tocar nada, y su
 * reversión. La lógica —qué documentos, qué se escribe, qué se relee— es del
 * paquete de equipos (`capturarRespaldo`, `restaurarRespaldo`); aquí sólo se
 * leen y escriben los ficheros, con permisos de dueño (0600) y fuera del
 * repositorio (lo comprueba el guion).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const respaldar = async ({ P, equipos, carpeta, decir }) => {
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  let fallos = 0;
  for (const e of equipos) {
    try {
      const r = await P.capturarRespaldo(e, new Date());
      const fichero = join(carpeta, `${e.familia}.json`);
      writeFileSync(fichero, `${JSON.stringify(r, null, 2)}\n`, { mode: 0o600 });
      chmodSync(fichero, 0o600);
      decir(`  ✓ ${e.familia}: ${r.documentos.length} documentos → ${fichero}`);
      for (const d of r.documentos.filter((x) => x.nota !== null))
        decir(`     · ${d.clave}: ${d.nota}`);
    } catch (error) {
      fallos += 1;
      decir(`  ✗ ${e.familia}: ${error.message}`);
    }
  }
  return fallos;
};

export const restaurar = async ({ P, equipos, carpeta, decir }) => {
  let fallos = 0;
  for (const e of equipos) {
    const fichero = join(carpeta, `${e.familia}.json`);
    if (!existsSync(fichero)) {
      decir(`  · ${e.familia}: no hay respaldo en ${fichero}`);
      continue;
    }
    const resultados = await P.restaurarRespaldo(e, JSON.parse(readFileSync(fichero, 'utf8')));
    for (const r of resultados) {
      if (r.estado === 'fallo') fallos += 1;
      const signo = { igual: '✓', restaurado: '✓', fallo: '✗', no_restaurable: '⚠' }[r.estado];
      decir(`  ${signo} ${e.familia} · ${r.clave}: ${r.estado} — ${r.detalle}`);
    }
  }
  return fallos;
};
