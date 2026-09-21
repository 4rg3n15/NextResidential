#!/usr/bin/env node
/**
 * CONTROL · `.env.example` declara EXACTAMENTE lo que el código lee.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE · D-90, reportado por el usuario tras semanas de aviso
 *
 * `pnpm entorno:diff` compara el `.env` de quien despliega contra
 * `.env.example`. Es un buen control y tenía un hueco enorme debajo: **nadie
 * comprobaba que `.env.example` dijera la verdad**. El resultado, medido:
 *
 *   · `DATABASE_POOLER_URL` estaba escrita **sin el `=`**, así que el
 *     comparador no la veía y la reclamaba en cada ejecución. Semanas.
 *   · `EVIDENCIA_BUCKET` no estaba, y la guía de conexión pide ponerla.
 *   · `RATE_LIMIT_TTL` y `RATE_LIMIT_LIMIT` estaban declaradas y **el código no
 *     las lee**: lee `THROTTLE_TTL_SEGUNDOS` y `THROTTLE_LIMITE`. Lo mismo con
 *     `MAX_PAYLOAD_BYTES` contra `LIMITE_PAYLOAD`.
 *
 * Esa última es la peor y no es cosmética: quien endurecía el límite de
 * peticiones editando `RATE_LIMIT_TTL` creía haberlo endurecido y seguía con el
 * valor por omisión, porque el esquema tiene `default()` y la aplicación
 * arranca igual. §2.7.5 exige rate limiting configurado; lo que había era rate
 * limiting configurable en un nombre que nadie lee.
 *
 * Es la familia de siempre con una cara nueva: el control existía —el
 * comparador— y comparaba contra un documento que nadie comprobaba.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÓMO SE COMPRUEBA
 *
 * Los dos conjuntos salen del código, no de una lista:
 *
 *   A · las claves del esquema Zod de `apps/api/src/configuracion/esquema.ts`,
 *       que es lo que la aplicación valida al arrancar.
 *   B · las claves que `.env.example` declara, leídas con **el mismo patrón que
 *       usa `comparar-entorno.mjs`** — si el comparador no la ve, aquí tampoco,
 *       y por eso un `=` que falta se detecta en vez de disculparse.
 *
 * Y se exige A = B, salvo las que se leen a propósito fuera de Zod, que están
 * abajo con su motivo. Esa lista **solo puede encoger**: una variable que se
 * deja de leer y se queda en el ejemplo también rompe.
 *
 *   node scripts/lib/entorno-declarado.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const ESQUEMA = 'apps/api/src/configuracion/esquema.ts';
const EJEMPLO = 'apps/api/.env.example';

/**
 * El MISMO patrón de `comparar-entorno.mjs`. Copiarlo no es duplicación
 * accidental: es la invariante de este control. Si aquí se aceptara una línea
 * sin `=` y allí no, este control diría que todo está bien mientras el
 * comparador sigue reclamando la variable — que es exactamente el defecto que
 * viene a cerrar.
 */
const NOMBRE = /^\s*(#\s*)?([A-Z][A-Z0-9_]*)\s*=/;

/**
 * Variables que el ejemplo declara y el esquema Zod NO valida, con su motivo.
 * Cada una es una decisión, no un olvido.
 */
const FUERA_DE_ZOD = new Map([
  // El adaptador de barrera las lee por `process.env` en `packages/providers`,
  // que no depende de NestJS ni del esquema de la API (§2.2).
  ['BARRERA_HOST', 'la lee packages/providers/src/barrera/desde-entorno.ts'],
  ['BARRERA_PUERTO', 'ídem'],
  ['BARRERA_USUARIO', 'ídem'],
  ['BARRERA_CLAVE', 'ídem'],
  ['BARRERA_TIEMPO_LIMITE_MS', 'ídem'],
  ['BARRERA_DISPOSITIVO_ID', 'la lee apps/api/src/guardia/guardia.module.ts'],
  ['PGBOSS_SCHEMA', 'la lee la configuración de pg-boss, fuera del esquema de la API'],
  // Las seis ya registradas como deuda en ESTADO_ETAPAS: están en el ejemplo y
  // Zod no las valida. Dueños y fecha, allí.
  ['DEVICE_VAULT_PROVIDER', 'deuda declarada: sin validar, dueño ETAPA 15'],
  ['DEVICE_VAULT_URL', 'deuda declarada: sin validar, dueño ETAPA 15'],
  ['BIOMETRIC_KEY_REF', 'deuda declarada: sin validar, dueño ETAPA 15'],
  ['BIOMETRIC_ALGORITHM', 'deuda declarada: sin validar, dueño ETAPA 15'],
  ['LOG_LEVEL', 'deuda declarada: sin validar, dueño ETAPA 14'],
  ['SENTRY_DSN', 'deuda declarada: sin validar, dueño ETAPA 14'],
]);

if (!existsSync(ESQUEMA) || !existsSync(EJEMPLO)) {
  console.error(`FALLO no encuentro ${ESQUEMA} o ${EJEMPLO}`);
  process.exit(1);
}

/** Claves del objeto Zod: una sangría de dos espacios y dos puntos. */
const delEsquema = new Set(
  [...readFileSync(ESQUEMA, 'utf8').matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]),
);

const declaradas = new Set();
for (const linea of readFileSync(EJEMPLO, 'utf8').split('\n')) {
  const m = NOMBRE.exec(linea);
  if (m !== null) declaradas.add(m[2]);
}

const problemas = [];

for (const clave of [...delEsquema].sort()) {
  if (!declaradas.has(clave)) {
    problemas.push(
      `${clave}: el esquema la valida y ${EJEMPLO} no la declara. ` +
        'Quien despliegue no sabrá que existe, y `entorno:diff` se la reclamará en cada corrida',
    );
  }
}

for (const clave of [...declaradas].sort()) {
  if (!delEsquema.has(clave) && !FUERA_DE_ZOD.has(clave)) {
    problemas.push(
      `${clave}: ${EJEMPLO} la declara y NADIE la lee. ` +
        'Quien la configure creerá haber configurado algo',
    );
  }
}

// Y la otra mitad del trinquete: una exención que ya no corresponde.
for (const [clave, motivo] of FUERA_DE_ZOD) {
  if (delEsquema.has(clave)) {
    problemas.push(`${clave} ya la valida el esquema Zod: quítela de FUERA_DE_ZOD (${motivo})`);
  } else if (!declaradas.has(clave)) {
    problemas.push(`${clave} está exenta y ya no se declara en el ejemplo: quítela de la lista`);
  }
}

if (problemas.length > 0) {
  console.error(`FALLO ${EJEMPLO} no dice la verdad sobre lo que el código lee:`);
  for (const p of problemas) console.error(`  ✗ ${p}`);
  console.error(
    '\n  `.env.example` es la única documentación de la configuración, y `entorno:diff`\n' +
      '  compara contra él. Un ejemplo que miente convierte los dos en ruido.',
  );
  process.exit(1);
}

console.log(
  `entorno declarado: ${delEsquema.size} variables del esquema, todas en .env.example · ` +
    `${FUERA_DE_ZOD.size} leídas fuera de Zod, con motivo`,
);
