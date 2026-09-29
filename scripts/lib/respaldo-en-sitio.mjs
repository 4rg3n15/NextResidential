/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo -- --capturar | --restaurar` · J2 (15-L) · C6 (15-M)
 *
 * El respaldo de la configuración de cada equipo ANTES de tocar nada, y su
 * reversión. La lógica —qué documentos, qué se escribe, qué se relee— es del
 * paquete de equipos (`capturarRespaldo`, `restaurarRespaldo`); aquí sólo se
 * leen y escriben los ficheros, con permisos de dueño (0600) y fuera del
 * repositorio (lo comprueba el guion).
 *
 * C6 · el fichero se identifica por el NÚMERO DE SERIE del equipo (leído del
 * propio aparato), no por la familia ni por la variable del .env: con N
 * cámaras, `camara.json` pisaría a la anterior. `--restaurar` lee la serie
 * del equipo que tiene delante y busca el respaldo de ESA serie; si no hay
 * ninguno que coincida, no escribe nada y lo dice.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const rotulo = (e) => (e.nombre === undefined ? e.familia : `${e.familia} «${e.nombre}»`);
/** Sólo caracteres seguros en un nombre de fichero: la serie viene del equipo. */
const nombreDeFichero = (familia, serie) =>
  `${familia}-${String(serie).replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

export const respaldar = async ({ P, equipos, carpeta, decir }) => {
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  let fallos = 0;
  for (const e of equipos) {
    try {
      const r = await P.capturarRespaldo(e, new Date());
      if (r.serie === null) throw new Error('el equipo no dijo su serie: sin ella no hay respaldo');
      const fichero = join(carpeta, nombreDeFichero(e.familia, r.serie));
      writeFileSync(fichero, `${JSON.stringify(r, null, 2)}\n`, { mode: 0o600 });
      chmodSync(fichero, 0o600);
      decir(`  ✓ ${rotulo(e)} · serie ${r.serie}: ${r.documentos.length} documentos → ${fichero}`);
      for (const d of r.documentos.filter((x) => x.nota !== null))
        decir(`     · ${d.clave}: ${d.nota}`);
    } catch (error) {
      fallos += 1;
      decir(`  ✗ ${rotulo(e)}: ${error.message}`);
    }
  }
  return fallos;
};

/** Los respaldos de la carpeta, por serie. Un fichero ilegible se ignora y se dice. */
const respaldosEn = (carpeta, decir) => {
  const porSerie = new Map();
  if (!existsSync(carpeta)) return porSerie;
  for (const f of readdirSync(carpeta).filter((x) => x.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(carpeta, f), 'utf8'));
      if (typeof r.serie === 'string' && r.serie !== '')
        porSerie.set(r.serie, { ...r, fichero: f });
    } catch {
      decir(`  · ${f}: no es un respaldo legible, se ignora`);
    }
  }
  return porSerie;
};

export const restaurar = async ({ P, equipos, carpeta, decir }) => {
  let fallos = 0;
  const respaldos = respaldosEn(carpeta, decir);
  for (const e of equipos) {
    const serie = await P.leerSerieDelEquipo(e).catch(() => null);
    if (serie === null) {
      fallos += 1;
      decir(`  ✗ ${rotulo(e)}: el equipo no dijo su serie; no se escribe nada`);
      continue;
    }
    const respaldo = respaldos.get(serie);
    if (respaldo === undefined) {
      decir(
        `  · ${rotulo(e)} · serie ${serie}: no hay respaldo de esta serie en ${carpeta}; no se escribe nada`,
      );
      continue;
    }
    const resultados = await P.restaurarRespaldo(e, respaldo);
    for (const r of resultados) {
      if (r.estado === 'fallo') fallos += 1;
      const signo = { igual: '✓', restaurado: '✓', fallo: '✗', no_restaurable: '⚠' }[r.estado];
      decir(`  ${signo} ${rotulo(e)} · ${r.clave}: ${r.estado} — ${r.detalle}`);
    }
  }
  return fallos;
};
