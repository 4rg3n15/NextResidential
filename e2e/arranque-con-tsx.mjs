/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-06 · LA API ARRANCA CON `tsx` —EL `start:dev`— Y SUS CONTROLADORES
 * RECIBEN SUS DEPENDENCIAS
 *
 * En sitio, el 26/09/2026, `pnpm --filter @ncr/api start:dev` cayó al arrancar
 * con «Cannot read properties of undefined (reading 'get')». `tsx` compila con
 * esbuild, que no emite `design:paramtypes`, y una clase que Nest inyecta POR
 * TIPO recibe `undefined`. Ni la suite (SWC con metadatos) ni el camino del
 * navegador (`node dist/main.js`, compilado con `tsc`) pasan por ahí: por eso
 * nadie lo vio antes de la visita.
 *
 * Qué comprueba, en este orden:
 *
 *   1. que el proceso llega a escribir «API arrancada» —el planificador caía
 *      antes—;
 *   2. que un controlador que se inyectaba por tipo contesta con su lógica y no
 *      con un 500 —el del consentimiento público: con `undefined` en su caso de
 *      uso, cualquier petición revienta—.
 *
 * `inyeccion-explicita.mjs` es la mitad estática del mismo control; esto es la
 * mitad que ARRANCA el proceso, que es lo que el usuario ejecutó en sitio.
 *
 * Los procesos se matan por PID de grupo: el arranque de `tsx` crea hijos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrancarDobleGotrue } from './doble-gotrue.mjs';

// 15-K · `NCR_RAIZ` apunta a un árbol de sonda (`arbol-de-sonda.mjs`) con un
// defecto reintroducido: es como la prueba negativa ve fallar este paso.
const raiz = process.env.NCR_RAIZ ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAZO_DE_ARRANQUE_MS = Number(process.env.NCR_PLAZO_TSX_MS ?? 90_000);

const puertoLibre = () =>
  new Promise((listo) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => listo(port));
    });
  });

const matarGrupo = (proceso) => {
  if (proceso === null || proceso.exitCode !== null) return;
  try {
    process.kill(-proceso.pid, 'SIGKILL');
  } catch {
    try {
      proceso.kill('SIGKILL');
    } catch {
      /* ya no está */
    }
  }
};

const principal = async () => {
  const doble = await arrancarDobleGotrue();
  const puerto = await puertoLibre();
  const cliDeTsx = createRequire(resolve(raiz, 'apps/api/package.json')).resolve('tsx/cli');

  const salida = [];
  const api = spawn(process.execPath, [cliDeTsx, 'src/main.ts'], {
    cwd: resolve(raiz, 'apps/api'),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(puerto),
      SUPABASE_URL: doble.url,
      SUPABASE_PUBLISHABLE_KEY: 'publicable-de-prueba',
      SUPABASE_SECRET_KEY: 'secreta-de-prueba',
      SUPABASE_JWKS_URL: doble.jwksUrl,
      DATABASE_URL: 'marcador',
      DATABASE_POOLER_URL: 'marcador',
      INGESTA_FIRMA_SECRETO: 'secreto-de-ingesta-para-el-arranque-tsx-32',
      BIOMETRIA_LLAVE: 'llave-de-biometria-para-el-arranque-tsx-32+',
      BIOMETRIA_LLAVE_REF: 'env:BIOMETRIA_LLAVE',
      EQUIPOS_LLAVE: 'llave-de-equipos-para-el-arranque-tsx-32++',
      EQUIPOS_LLAVE_REF: 'env:EQUIPOS_LLAVE',
      CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3100',
      // Sin base de verdad: que no intente conectar. El defecto de sitio NO
      // dependía de la cola: el planificador pedía su `ModuleRef` igual.
      PLANIFICADOR_HABILITADO: 'false',
    },
  });
  api.stdout.on('data', (d) => salida.push(String(d)));
  api.stderr.on('data', (d) => salida.push(String(d)));

  const cola = () =>
    salida
      .join('')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .slice(-12)
      .map((l) => `     ${l.slice(0, 240)}`)
      .join('\n');

  try {
    const arrancada = await new Promise((listo) => {
      const limite = setTimeout(() => listo('plazo'), PLAZO_DE_ARRANQUE_MS);
      const mirar = () => {
        if (/API arrancada/.test(salida.join(''))) {
          clearTimeout(limite);
          listo('si');
        }
      };
      api.stdout.on('data', mirar);
      api.stderr.on('data', mirar);
      api.on('exit', (codigo) => {
        clearTimeout(limite);
        listo(`murió con código ${String(codigo)}`);
      });
    });
    if (arrancada !== 'si') {
      console.log(
        `✗ con tsx la API NO llegó a «API arrancada» (${arrancada === 'plazo' ? `plazo de ${String(PLAZO_DE_ARRANQUE_MS / 1000)} s` : arrancada})`,
      );
      console.log(cola());
      return 1;
    }
    console.log('   ✓ con tsx la API llega a «API arrancada»');

    // Un controlador que se inyectaba por tipo: con `undefined` dentro, 500.
    const r = await fetch(`http://127.0.0.1:${String(puerto)}/consentimiento/enlace-que-no-existe`);
    if (r.status >= 500) {
      console.log(
        `✗ con tsx el controlador del consentimiento contesta ${String(r.status)}: le falta una dependencia`,
      );
      console.log(cola());
      return 1;
    }
    console.log(
      `   ✓ con tsx un controlador inyectado contesta con su lógica (${String(r.status)}, no 500)`,
    );
    return 0;
  } finally {
    matarGrupo(api);
    await doble.cerrar?.();
  }
};

principal()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.log(
      `✗ el arranque con tsx no se pudo comprobar: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  });
