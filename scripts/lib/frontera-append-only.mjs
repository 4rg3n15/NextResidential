#!/usr/bin/env node
/**
 * NINGUNA CLAVE AJENA VIGENTE PUEDE APUNTAR A UNA TABLA APPEND-ONLY.
 *
 * POR QUÉ EXISTE. La migración 0011 declaró `alertas_evento_fk` hacia
 * `eventos`. Es correcta como modelo y **imposible en esta base**: la
 * comprobación de integridad referencial bloquea la fila referenciada con
 * `SELECT ... FOR KEY SHARE`, y PostgreSQL exige para ese bloqueo el
 * privilegio UPDATE o DELETE además del SELECT. ADR-005 se los revoca a todos
 * los roles y también al dueño, así que cualquier inserción en `alertas` con
 * `evento_id` fallaba con «permission denied for table eventos».
 *
 * Estuvo así desde la ETAPA 01 sin que ninguna suite lo notara, porque hasta la
 * ETAPA 06 no se insertaba ni un evento ni una alerta: una restricción que
 * nunca se ejerce no se distingue de una que funciona. Es la misma familia de
 * los tres falsos verdes anteriores.
 *
 * La migración 0021 lo corrige y deja una aserción de despliegue. Este control
 * lo detecta **antes**, leyendo el SQL versionado: la aserción avisa cuando
 * alguien ya escribió la migración y la está aplicando; esto avisa cuando la
 * escribe.
 *
 * CÓMO CUENTA. Una restricción declarada en una migración y RETIRADA en otra
 * posterior no es un hallazgo: las migraciones son historia y no se editan
 * (decisión D-10), así que la declaración original sigue en el árbol para
 * siempre. Lo que se persigue es la que sigue **vigente** al final de la
 * cadena.
 *
 *   node scripts/lib/frontera-append-only.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Tablas con UPDATE y DELETE revocados a todos, dueño incluido (ADR-005). */
const APPEND_ONLY = ['eventos', 'evidencias', 'auditoria_seguridad', 'recepciones_evento'];

/**
 * Se lee el DIRECTORIO, no `git ls-files`. Una migración recién escrita todavía
 * no está en el índice, y ese es justo el momento en que este control debe
 * hablar: cuando alguien acaba de declarar la clave ajena, no cuando ya la
 * confirmó.
 */
const DIRECTORIO = 'supabase/migrations';
const ficheros = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => join(DIRECTORIO, f));

/** Quita los comentarios de línea: la 0019 y la 0021 EXPLICAN el problema. */
const sinComentarios = (sql) =>
  sql
    .split('\n')
    .map((l) => (l.trim().startsWith('--') ? '' : l))
    .join('\n');

/**
 * `FOREIGN KEY (cols)` seguido INMEDIATAMENTE de su `REFERENCES`. El punto y
 * coma no sirve de frontera: dentro de un `CREATE TABLE` hay varias
 * restricciones sin ninguno entre medias, y un comodín perezoso saltaba de una
 * a otra atribuyendo el destino de la siguiente al nombre de la anterior.
 */
const declaracion = new RegExp(
  `CONSTRAINT\\s+([A-Za-z0-9_]+)\\s+FOREIGN\\s+KEY\\s*\\([^)]*\\)\\s*` +
    `REFERENCES\\s+(?:public\\.)?(${APPEND_ONLY.join('|')})\\s*\\(`,
  'gis',
);

/**
 * TODA referencia a una append-only. Las que quedan fuera de una declaración
 * con nombre son referencias en línea, que no se pueden retirar por nombre y
 * por tanto son siempre hallazgo. Se localizan por POSICIÓN y no con una
 * mirada atrás: entre `FOREIGN KEY (...)` y su `REFERENCES` hay un salto de
 * línea y sangría, y una mirada atrás de longitud acotada se los perdía.
 */
const cualquierReferencia = new RegExp(
  `REFERENCES\\s+(?:public\\.)?(${APPEND_ONLY.join('|')})\\s*\\(`,
  'gi',
);
const retirada = /DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_]+)/gi;

const declaradas = new Map();
const retiradas = new Set();

for (const fichero of ficheros) {
  const sql = sinComentarios(readFileSync(fichero, 'utf8'));

  const conNombre = [];
  for (const m of sql.matchAll(declaracion)) {
    declaradas.set(m[1], { fichero, tabla: m[2] });
    conNombre.push([m.index, m.index + m[0].length]);
  }
  for (const m of sql.matchAll(retirada)) {
    retiradas.add(m[1]);
  }
  // Sin nombre no hay forma de retirarla explícitamente: es siempre hallazgo.
  for (const m of sql.matchAll(cualquierReferencia)) {
    const dentroDeUnaConNombre = conNombre.some(
      ([inicio, fin]) => m.index >= inicio && m.index < fin,
    );
    if (dentroDeUnaConNombre) continue;
    const etiqueta = `${fichero}:${sql.slice(0, m.index).split('\n').length} (en linea)`;
    declaradas.set(etiqueta, { fichero, tabla: m[1] });
  }
}

const vigentes = [...declaradas.entries()].filter(([nombre]) => !retiradas.has(nombre));

if (vigentes.length > 0) {
  console.error(
    `clave(s) ajena(s) VIGENTE(S) hacia una tabla append-only: ${vigentes.length}\n` +
      'La comprobacion de la clave ajena exige bloquear la fila referenciada, y\n' +
      'ADR-005 revoca a TODOS los privilegios que ese bloqueo necesita. La fila\n' +
      'no se podra insertar jamas. Usa un trigger de existencia (migracion 0021).\n',
  );
  for (const [nombre, d] of vigentes) {
    console.error(`  ${nombre}  →  ${d.tabla}   (${d.fichero})`);
  }
  process.exit(1);
}

console.log(
  `sin claves ajenas vigentes hacia tablas append-only ` +
    `(${declaradas.size} declaradas, ${declaradas.size - vigentes.length} retiradas, ` +
    `${APPEND_ONLY.length} tablas vigiladas)`,
);
