#!/usr/bin/env node
/**
 * CONTROL · ningún secreto viaja dentro del binario de Flutter.
 *
 * POR QUÉ EXISTE. `CONEXION_SUPABASE.md` lo advierte desde la ETAPA 01: **todo
 * lo compilado en Flutter es extraíble del binario**. Un `.apk` es un zip y
 * `strings` sobre la librería nativa saca cualquier literal en segundos. La
 * advertencia estaba escrita y no la comprobaba nada, que es la familia de
 * defecto que este repositorio persigue.
 *
 * QUÉ BUSCA, y por qué cada cosa:
 *
 *  1. **Nombres de variables prohibidas** (`SUPABASE_SECRET_KEY`,
 *     `INGESTA_FIRMA_SECRETO`, `BIOMETRIA_LLAVE`, `DATABASE_URL`…). Si el
 *     nombre aparece en el código de la app es que alguien pensó en leerlo con
 *     `String.fromEnvironment`, y entonces alguien lo pasará con
 *     `--dart-define` y acabará dentro del binario.
 *  2. **Valores con forma de llave secreta** (`sb_secret_…`, `service_role`,
 *     un JWT literal). Es la misma forma que busca `escanear-secretos.mjs` en
 *     el resto del repositorio, aplicada aquí porque `apps/mobile` es código
 *     que se distribuye, no que se despliega.
 *  3. **`.env` empaquetado como activo.** Un fichero declarado en `assets:`
 *     viaja dentro del `.apk` y se lee con un descompresor. Es el rodeo más
 *     común a la regla 1.
 *
 * Lo que NO marca: `SUPABASE_PUBLISHABLE_KEY` ni `API_URL`. La llave publicable
 * resuelve al rol `anon` y está sujeta a RLS; la dirección de la API es pública
 * y toda ruta exige token. Marcarlas sería ruido, y un control ruidoso se acaba
 * desactivando.
 *
 *   node scripts/lib/flutter-sin-secretos.mjs [ruta-de-la-app]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const raizApp = process.argv[2] ?? 'apps/mobile';

if (!existsSync(raizApp)) {
  console.error(`FALLO no existe ${raizApp}`);
  process.exit(1);
}

/** Nombres que no pueden aparecer en el código de la app, con su motivo. */
const NOMBRES_PROHIBIDOS = [
  ['SUPABASE_SECRET_KEY', 'omite la RLS por completo: es el proyecto entero'],
  ['SUPABASE_SERVICE_ROLE', 'la llave heredada equivalente'],
  ['INGESTA_FIRMA_SECRETO', 'permitiría fabricar eventos de acceso'],
  ['BIOMETRIA_LLAVE', 'descifra plantillas biométricas (Ley 1581)'],
  ['DATABASE_URL', 'la app no habla con PostgreSQL; habla con la API'],
  ['DEVICE_VAULT', 'credenciales de los equipos del fabricante (RN-21, KPI-11)'],
];

/** Formas de valor que delatan una llave pegada en el código. */
const FORMAS = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'llave secreta de Supabase'],
  [/\bservice_role\b/, 'rol que omite la RLS'],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, 'JWT literal'],
];

const hallazgos = [];

const recorrer = (directorio) => {
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);
    const info = statSync(ruta);
    if (info.isDirectory()) {
      if (
        ['build', '.dart_tool', 'ios', 'android', 'macos', 'windows', 'linux'].includes(entrada)
      ) {
        continue;
      }
      recorrer(ruta);
      continue;
    }
    if (!/\.(dart|yaml|json)$/.test(entrada)) continue;

    const texto = readFileSync(ruta, 'utf8');
    const relativa = relative(process.cwd(), ruta);

    for (const [nombre, motivo] of NOMBRES_PROHIBIDOS) {
      if (texto.includes(nombre)) {
        // El fichero que DECLARA la lista de prohibidos es el propio control y
        // el comentario de `ambiente.dart` que explica la regla: citarlos no es
        // usarlos. Se distingue por si el nombre aparece dentro de una llamada
        // real a la configuración de compilación.
        const usoReal = new RegExp(
          `(fromEnvironment|dart-define|dotenv|Platform\\.environment)[^\\n]*${nombre}`,
        ).test(texto);
        const lineaCitada = texto
          .split('\n')
          .find((l) => l.includes(nombre) && !/^\s*(\/\/|\/\*|\*|#)/.test(l));
        if (usoReal || (lineaCitada !== undefined && !/['"`|]/.test(lineaCitada.trim()[0] ?? ''))) {
          hallazgos.push(`${relativa}: usa «${nombre}» — ${motivo}`);
        }
      }
    }

    /**
     * Las FORMAS se buscan solo en código, no en comentarios. La palabra
     * `service_role` aparece legítimamente en la cabecera de `ambiente.dart`
     * —explicando por qué esa llave NO puede viajar—, y marcarla convertiría
     * este control en ruido: un control ruidoso se acaba desactivando, y
     * entonces no controla nada. Un secreto PEGADO en un comentario lo sigue
     * cazando `escanear-secretos.mjs`, que recorre el repositorio entero sin
     * esta exención.
     */
    const soloCodigo = texto
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*|#)/.test(l))
      .join('\n');

    for (const [forma, motivo] of FORMAS) {
      const m = forma.exec(soloCodigo);
      if (m !== null) {
        // La lista de formas vive en este mismo control y en la prueba que lo
        // ejerce: ahí son datos, no secretos.
        if (relativa.includes('flutter-sin-secretos') || relativa.includes('tema_test')) continue;
        hallazgos.push(`${relativa}: contiene ${motivo}`);
      }
    }
  }
};

recorrer(join(raizApp, 'lib'));
for (const suelto of ['pubspec.yaml']) {
  const ruta = join(raizApp, suelto);
  if (existsSync(ruta)) {
    const texto = readFileSync(ruta, 'utf8');
    // Un `.env` empaquetado como activo viaja dentro del binario.
    if (/^\s*-\s*[^\n]*\.env/m.test(texto)) {
      hallazgos.push(`${suelto}: empaqueta un fichero .env como activo`);
    }
  }
}

if (hallazgos.length > 0) {
  console.error(`FALLO ${hallazgos.length} hallazgo(s) en el binario de Flutter:`);
  for (const h of hallazgos) console.error(`  · ${h}`);
  console.error('\nTodo lo compilado en Flutter es extraíble: no hay ofuscación que lo arregle.');
  process.exit(1);
}

console.log('sin secretos: la app no nombra ni incrusta ninguna llave que omita la RLS');
