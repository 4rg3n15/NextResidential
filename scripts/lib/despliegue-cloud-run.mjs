#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA CONFIGURACIÓN DE LA API PARA CLOUD RUN · D-154 (ADR-040)
 *
 * El flujo `desplegar-api.yml` no escribe a mano ni una variable: las saca de
 * dos ficheros versionados SIN valores reales y este guion las prepara.
 *
 *   · `apps/api/cloud-run/variables.yaml` → el fichero de `--env-vars-file`,
 *     con cada `${NCR_…}` sustituido por la variable de GitHub del mismo
 *     nombre. Falta una, o está vacía: no se despliega.
 *   · `apps/api/cloud-run/secretos.txt` → el valor de `--set-secrets`
 *     (`VARIABLE=secreto:latest,…`). Sólo nombres: el valor vive en Secret
 *     Manager.
 *
 * Y comprueba, contra `apps/api/.env.example`, que ninguna variable es
 * inventada, que ninguna secreta va como variable normal y que las que la API
 * exige para arrancar están en uno de los dos ficheros.
 *
 *   node scripts/lib/despliegue-cloud-run.mjs variables <salida.yaml>
 *   node scripts/lib/despliegue-cloud-run.mjs secretos
 *
 * La salida nunca lleva un valor: `variables` escribe el fichero y dice
 * cuántas; `secretos` imprime nombres de variables y de secretos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Las que `configuracion/esquema.ts` exige sin valor por omisión. */
export const OBLIGATORIAS = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_JWKS_URL',
  'DATABASE_URL',
  'DATABASE_POOLER_URL',
  'CORS_ALLOWED_ORIGINS',
  'INGESTA_FIRMA_SECRETO',
  'BIOMETRIA_LLAVE',
  'EQUIPOS_LLAVE',
];

/**
 * Las que NUNCA van como variable normal: una variable de Cloud Run la lee
 * cualquiera con `run.services.get`, y aparece en `gcloud run services
 * describe`. Un secreto de Secret Manager sólo lo lee la cuenta de ejecución.
 */
export const SECRETAS = [
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'DATABASE_POOLER_URL',
  'PGBOSS_DATABASE_URL',
  'INGESTA_FIRMA_SECRETO',
  'BIOMETRIA_LLAVE',
  'EQUIPOS_LLAVE',
  'API_IP_FIRMA_SECRETO',
  'WEB_PUSH_VAPID_PRIVADA',
  'WEBRTC_TURN_SECRETO',
  'CORREO_SMTP_CLAVE',
  'ALARM_SERVER_EQUIPOS',
  'BARRERA_CLAVE',
];

const MARCADOR = /\$\{([A-Za-z0-9_]*)\}/g;
const NOMBRE_DE_SECRETO = /^[a-z][a-z0-9-]{0,254}$/;

/** Nombres que declara `.env.example` (también los comentados `# NOMBRE=`). */
export const variablesDeclaradas = (ejemplo) =>
  new Set(
    ejemplo
      .split('\n')
      .map((l) => /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(l.trim())?.[1])
      .filter((n) => n !== undefined),
  );

/** `CLAVE: "valor"` por línea; comentarios y vacías fuera. Nada de YAML anidado. */
export const leerVariables = (plantilla) => {
  const variables = new Map();
  for (const [i, linea] of plantilla.split('\n').entries()) {
    const t = linea.trim();
    if (t === '' || t.startsWith('#')) continue;
    const m = /^([A-Z][A-Z0-9_]*):\s*"([^"\\]*)"$/.exec(t);
    if (m === null) throw new Error(`variables.yaml:${String(i + 1)}: se espera CLAVE: "valor"`);
    if (variables.has(m[1])) throw new Error(`variables.yaml: ${m[1]} está dos veces`);
    variables.set(m[1], m[2]);
  }
  return variables;
};

/** `VARIABLE=secreto` por línea; comentarios y vacías fuera. */
export const leerSecretos = (lista) => {
  const secretos = new Map();
  for (const [i, linea] of lista.split('\n').entries()) {
    const t = linea.trim();
    if (t === '' || t.startsWith('#')) continue;
    const m = /^([A-Z][A-Z0-9_]*)=(\S+)$/.exec(t);
    if (m === null || !NOMBRE_DE_SECRETO.test(m[2]))
      throw new Error(`secretos.txt:${String(i + 1)}: se espera VARIABLE=nombre-del-secreto`);
    if (secretos.has(m[1])) throw new Error(`secretos.txt: ${m[1]} está dos veces`);
    secretos.set(m[1], m[2]);
  }
  return secretos;
};

/** Los fallos de forma: una lista de motivos, vacía si todo cuadra. */
export const problemas = (variables, secretos, declaradas) => {
  const motivos = [];
  for (const nombre of [...variables.keys(), ...secretos.keys()]) {
    if (!declaradas.has(nombre)) motivos.push(`${nombre} no está en apps/api/.env.example`);
  }
  for (const nombre of variables.keys()) {
    if (SECRETAS.includes(nombre))
      motivos.push(`${nombre} es secreta: va en secretos.txt, no en variables.yaml`);
    if (secretos.has(nombre)) motivos.push(`${nombre} está en los dos ficheros`);
  }
  for (const nombre of OBLIGATORIAS) {
    if (!variables.has(nombre) && !secretos.has(nombre))
      motivos.push(`${nombre} la exige la API y no está en ningún fichero`);
  }
  for (const [nombre, valor] of variables) {
    for (const [, marcador] of valor.matchAll(MARCADOR)) {
      if (!/^NCR_[A-Z0-9_]+$/.test(marcador))
        motivos.push(`${nombre}: el marcador \${${marcador}} no empieza por NCR_`);
    }
  }
  return motivos;
};

/** Sustituye cada `${NCR_…}`. Falta uno, o está vacío, o trae comillas o saltos: error. */
export const sustituir = (variables, entorno) => {
  const faltan = new Set();
  const salida = new Map();
  for (const [nombre, valor] of variables) {
    salida.set(
      nombre,
      valor.replace(MARCADOR, (_todo, marcador) => {
        const v = entorno[marcador];
        if (v === undefined || v.trim() === '' || /["\\\n\r]/.test(v)) {
          faltan.add(marcador);
          return '';
        }
        return v.trim();
      }),
    );
  }
  if (faltan.size > 0)
    throw new Error(`faltan, vacías o con comillas: ${[...faltan].sort().join(', ')}`);
  return salida;
};

export const comoYaml = (variables) =>
  [...variables].map(([k, v]) => `${k}: "${v}"`).join('\n') + '\n';

export const banderaDeSecretos = (secretos) =>
  [...secretos].map(([variable, secreto]) => `${variable}=${secreto}:latest`).join(',');

/** Lee los tres ficheros del repositorio y comprueba. Lanza con todos los motivos. */
export const cargar = (raiz) => {
  const leer = (r) => readFileSync(join(raiz, r), 'utf8');
  const variables = leerVariables(leer('apps/api/cloud-run/variables.yaml'));
  const secretos = leerSecretos(leer('apps/api/cloud-run/secretos.txt'));
  const motivos = problemas(
    variables,
    secretos,
    variablesDeclaradas(leer('apps/api/.env.example')),
  );
  if (motivos.length > 0) throw new Error(motivos.join('\n'));
  return { variables, secretos };
};

const esPrincipal =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const [orden, destino] = process.argv.slice(2);
  try {
    const { variables, secretos } = cargar(raiz);
    if (orden === 'variables' && destino !== undefined) {
      writeFileSync(destino, comoYaml(sustituir(variables, process.env)), { mode: 0o600 });
      console.log(`variables de Cloud Run: ${String(variables.size)} escritas en ${destino}`);
    } else if (orden === 'secretos') {
      console.log(banderaDeSecretos(secretos));
    } else if (orden === 'comprobar') {
      console.log(
        `variables.yaml y secretos.txt cuadran: ${String(variables.size)} variables, ${String(secretos.size)} secretos`,
      );
    } else {
      throw new Error(
        'uso: despliegue-cloud-run.mjs variables <salida.yaml> | secretos | comprobar',
      );
    }
  } catch (error) {
    console.error(
      `FALLO despliegue-cloud-run: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
