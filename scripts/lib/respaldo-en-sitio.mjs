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
 *
 * OTROS FALLOS (15-M) · la llave es FAMILIA + SERIE (`llaveDelRespaldo`), no
 * la serie sola; y si dos fichas de la misma corrida dan la misma serie —dos
 * entradas del registro con la IP del mismo aparato— la segunda no pisa a la
 * primera: se dice y cuenta como fallo. [SUPUESTO] S-160.
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

export const respaldar = async ({ P, equipos, carpeta, decir }) => {
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  let fallos = 0;
  /** Quién escribió ya cada llave en ESTA corrida. */
  const escritos = new Map();
  for (const e of equipos) {
    try {
      const r = await P.capturarRespaldo(e, new Date());
      if (r.serie === null) throw new Error('el equipo no dijo su serie: sin ella no hay respaldo');
      const llave = P.llaveDelRespaldo(e.familia, r.serie);
      const previo = escritos.get(llave);
      if (previo !== undefined) {
        throw new Error(
          `da la misma serie ${r.serie} que ${previo}: las dos fichas apuntan al mismo equipo ` +
            '(revise su IP en la consola); no se sobrescribe su respaldo',
        );
      }
      escritos.set(llave, rotulo(e));
      const fichero = join(carpeta, P.ficheroDelRespaldo(e.familia, r.serie));
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

/** Los respaldos de la carpeta. Un fichero ilegible se ignora y se dice. */
const respaldosEn = (carpeta, decir) => {
  const leidos = [];
  if (!existsSync(carpeta)) return leidos;
  for (const f of readdirSync(carpeta).filter((x) => x.endsWith('.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(carpeta, f), 'utf8'));
      if (typeof r.serie === 'string' && r.serie !== '' && typeof r.familia === 'string')
        leidos.push({ ...r, fichero: f });
    } catch {
      decir(`  · ${f}: no es un respaldo legible, se ignora`);
    }
  }
  return leidos;
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
    const respaldo = P.respaldoPara(respaldos, e.familia, serie);
    if (respaldo === null) {
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
