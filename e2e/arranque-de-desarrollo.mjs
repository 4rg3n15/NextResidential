/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-06 · `start:dev` —EL ARRANQUE DE SITIO— INYECTA Y VALIDA; CON `tsx`
 * LA API SE NIEGA A ARRANCAR
 *
 * En sitio, el 26/09/2026, `pnpm --filter @ncr/api start:dev` cayó al arrancar
 * con «Cannot read properties of undefined (reading 'get')». `start:dev` era
 * `tsx`, que compila con esbuild y no emite `design:paramtypes`: una clase que
 * Nest inyecta POR TIPO recibía `undefined`. La 15-K lo arregló con `@Inject`
 * explícito y este paso lo arrancaba con tsx… y no miraba la otra mitad, la
 * silenciosa: sin esos metadatos el `ValidationPipe` global no sabe qué DTO
 * lleva cada `@Body()` o `@Query()` y NO VALIDA NADA. El recorrido de la
 * consola lo destapó en el anexo: con tsx, el historial de eventos contestaba
 * 400 porque `tamanoPagina` llegaba al dominio como texto.
 *
 * Ahora `start:dev` compila con `tsc` (que emite los metadatos) y la API se
 * niega a arrancar sin ellos. Qué comprueba, en este orden:
 *
 *   1. que `pnpm run start:dev` llega a «API arrancada»;
 *   2. que un controlador que se inyectaba por tipo contesta con su lógica y no
 *      con un 500 —el del consentimiento público—;
 *   3. que el `ValidationPipe` VALIDA: una respuesta del titular con un valor
 *      fuera de su enumerado y un campo no declarado recibe 400; inerte, la
 *      petición llegaría al caso de uso y volvería con la redirección 303;
 *   4. que con `tsx` la API NO arranca y dice por qué.
 *
 * Sin base: adaptadores en memoria y un doble de GoTrue, como el 12c. Los
 * procesos se matan por PID de grupo: pnpm, `node --watch` y tsx crean hijos.
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
// `start:dev` compila antes de arrancar: en un árbol de sonda, sin `dist`, la
// compilación completa de la API entra en el plazo.
const PLAZO_DE_ARRANQUE_MS = Number(process.env.NCR_PLAZO_ARRANQUE_MS ?? 240_000);
const cwd = resolve(raiz, 'apps/api');

const puertoLibre = () =>
  new Promise((listo) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => listo(port));
    });
  });

const matarGrupo = (proceso) => {
  if (proceso === null) return;
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

const entornoDe = (doble, puerto) => ({
  ...process.env,
  NODE_ENV: 'production',
  NCR_IGNORAR_ENV_FILE: '1',
  PORT: String(puerto),
  SUPABASE_URL: doble.url,
  SUPABASE_PUBLISHABLE_KEY: 'publicable-de-prueba',
  SUPABASE_SECRET_KEY: 'secreta-de-prueba',
  SUPABASE_JWKS_URL: doble.jwksUrl,
  DATABASE_URL: 'marcador',
  DATABASE_POOLER_URL: 'marcador',
  INGESTA_FIRMA_SECRETO: 'secreto-de-ingesta-para-el-arranque-dev-32',
  BIOMETRIA_LLAVE: 'llave-de-biometria-para-el-arranque-dev-32+',
  BIOMETRIA_LLAVE_REF: 'env:BIOMETRIA_LLAVE',
  EQUIPOS_LLAVE: 'llave-de-equipos-para-el-arranque-dev-32++',
  EQUIPOS_LLAVE_REF: 'env:EQUIPOS_LLAVE',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3100',
  // Sin base de verdad: que no intente conectar. El defecto de sitio NO
  // dependía de la cola: el planificador pedía su `ModuleRef` igual.
  PLANIFICADOR_HABILITADO: 'false',
});

/** Lanza la API y espera a «API arrancada», a su muerte o al plazo. */
const lanzar = async (orden, argumentos, entorno) => {
  const salida = [];
  const proceso = spawn(orden, argumentos, {
    cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: entorno,
  });
  proceso.stdout.on('data', (d) => salida.push(String(d)));
  proceso.stderr.on('data', (d) => salida.push(String(d)));
  const desenlace = await new Promise((listo) => {
    const limite = setTimeout(() => listo('plazo'), PLAZO_DE_ARRANQUE_MS);
    const mirar = () => {
      if (/API arrancada/.test(salida.join(''))) {
        clearTimeout(limite);
        listo('arrancada');
      }
    };
    proceso.stdout.on('data', mirar);
    proceso.stderr.on('data', mirar);
    proceso.on('exit', (codigo) => {
      clearTimeout(limite);
      listo(`murió con código ${String(codigo)}`);
    });
  });
  const cola = () =>
    salida
      .join('')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .slice(-12)
      .map((l) => `     ${l.slice(0, 240)}`)
      .join('\n');
  return { proceso, desenlace, salida, cola };
};

const comprobarStartDev = async (doble) => {
  const puerto = await puertoLibre();
  const api = await lanzar('pnpm', ['run', 'start:dev'], entornoDe(doble, puerto));
  const fallos = [];
  try {
    if (api.desenlace !== 'arrancada') {
      console.log(
        `✗ con start:dev la API NO llegó a «API arrancada» (${api.desenlace === 'plazo' ? `plazo de ${String(PLAZO_DE_ARRANQUE_MS / 1000)} s` : api.desenlace})`,
      );
      console.log(api.cola());
      return 1;
    }
    console.log('   ✓ con start:dev la API llega a «API arrancada»');

    const base = `http://127.0.0.1:${String(puerto)}`;
    // Un controlador que se inyectaba por tipo: con `undefined` dentro, 500.
    const inyectado = await fetch(`${base}/consentimiento/enlace-que-no-existe`);
    if (inyectado.status >= 500) {
      fallos.push(
        `✗ con start:dev el controlador del consentimiento contesta ${String(inyectado.status)}: le falta una dependencia`,
      );
    } else {
      console.log(
        `   ✓ un controlador inyectado contesta con su lógica (${String(inyectado.status)}, no 500)`,
      );
    }

    // El DTO sólo admite `acepta: 'si' | 'no'`. Inerte, esto llega al caso de
    // uso, que no encuentra el enlace y redirige (303).
    const validada = await fetch(`${base}/consentimiento/enlace-que-no-existe/respuesta`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acepta: 'quizas', campoNoDeclarado: 1 }),
    });
    if (validada.status !== 400) {
      fallos.push(
        `✗ con start:dev el ValidationPipe NO valida: un cuerpo fuera del DTO recibe ${String(validada.status)} y no 400 (H-SITIO-06, §2.7.3)`,
      );
    } else {
      console.log('   ✓ el ValidationPipe valida: un cuerpo fuera del DTO recibe 400');
    }
  } finally {
    matarGrupo(api.proceso);
  }
  for (const f of fallos) console.log(f);
  if (fallos.length > 0) console.log(api.cola());
  return fallos.length === 0 ? 0 : 1;
};

const comprobarNegativaConTsx = async (doble) => {
  const cliDeTsx = createRequire(resolve(cwd, 'package.json')).resolve('tsx/cli');
  const puerto = await puertoLibre();
  const api = await lanzar(process.execPath, [cliDeTsx, 'src/main.ts'], entornoDe(doble, puerto));
  try {
    const dicho = /no emite metadatos de tipos/.test(api.salida.join(''));
    if (api.desenlace === 'arrancada' || !dicho) {
      console.log(
        api.desenlace === 'arrancada'
          ? '✗ con tsx la API ARRANCA sin metadatos de tipos: serviría sin validar ningún DTO (H-SITIO-06)'
          : `✗ con tsx la API no arranca, pero no dice que le faltan los metadatos de tipos (${api.desenlace})`,
      );
      console.log(api.cola());
      return 1;
    }
    console.log('   ✓ con tsx la API se niega a arrancar y dice por qué: sin metadatos no valida');
    return 0;
  } finally {
    matarGrupo(api.proceso);
  }
};

const principal = async () => {
  const doble = await arrancarDobleGotrue();
  try {
    const conStartDev = await comprobarStartDev(doble);
    const conTsx = await comprobarNegativaConTsx(doble);
    return conStartDev === 0 && conTsx === 0 ? 0 : 1;
  } finally {
    await doble.cerrar?.();
  }
};

principal()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.log(
      `✗ el arranque de desarrollo no se pudo comprobar: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  });
