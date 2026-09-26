/**
 * ═════════════════════════════════════════════════════════════════════════════
 * §4 (15-K) · EL RECORRIDO DE LA CONSOLA, VISTO FALLAR
 *
 * Un recorrido en verde sólo demuestra algo si se le ha visto ponerse rojo con
 * el defecto que dice cazar. Aquí se reintroducen, UNO A UNO y cada uno en su
 * propio árbol de sonda, los tres defectos de sitio que vivían en la costura
 * consola ↔ proxy ↔ API ↔ base, y se exige que el recorrido falle NOMBRÁNDOLO:
 *
 *   · H-SITIO-02 · el tablero vuelve a leer de memoria → el alta no aparece.
 *   · H-SITIO-03 · la ruta del consentimiento vuelve a negar al
 *                  superadministrador → no puede comprobarlo.
 *   · H-SITIO-08 · el proxy de la consola vuelve a no exportar PUT → la
 *                  edición no se guarda.
 *
 * Un fallo por OTRO motivo no cuenta: si el recorrido se cae antes de llegar a
 * la comprobación, la sonda no ha demostrado nada y lo dice.
 *
 * La API de las sondas corre con `tsx` desde el fuente del árbol (no hay que
 * compilarla); la consola se reutiliza compilada salvo en H-SITIO-08, donde el
 * defecto vive en ella y se compila en el árbol.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { arbolDeSonda, raizDelRepositorio } from './arbol-de-sonda.mjs';

const SONDAS = [
  {
    id: 'H-SITIO-02',
    copiar: 'apps/api',
    fichero: 'apps/api/src/tablero/tablero.module.ts',
    antes: "const enBase = configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres';",
    despues: 'const enBase = false;',
  },
  {
    id: 'H-SITIO-03',
    copiar: 'apps/api',
    fichero: 'apps/api/src/biometria/presentacion/biometria.controller.ts',
    antes:
      "@Roles('superadministrador', 'administrador', 'portero', 'operador_central', 'residente')",
    despues: "@Roles('administrador', 'portero', 'operador_central', 'residente')",
  },
  {
    id: 'H-SITIO-08',
    copiar: 'apps/web',
    fichero: 'apps/web/src/app/api/ncr/[...ruta]/route.ts',
    antes: 'export const PUT = manejar;',
    despues: '',
  },
];

const soloEstas = (process.env.NCR_SONDAS ?? '').split(',').filter((x) => x !== '');
let fallos = 0;
let corridas = 0;

for (const sonda of SONDAS.filter((s) => soloEstas.length === 0 || soloEstas.includes(s.id))) {
  corridas += 1;
  console.log(`\n▸ ${sonda.id} reintroducido`);
  const arbol = arbolDeSonda({ copiar: [sonda.copiar] });
  try {
    arbol.mutar(sonda.fichero, sonda.antes, sonda.despues);
    const enLaApi = sonda.copiar === 'apps/api';
    const r = spawnSync('node', ['e2e/recorrido-de-consola.mjs'], {
      cwd: raizDelRepositorio,
      encoding: 'utf8',
      timeout: 900_000,
      env: {
        ...process.env,
        ...(enLaApi
          ? { NCR_RAIZ_API: arbol.raiz, NCR_API_CON_TSX: '1', NCR_REUTILIZAR_CONSOLA: '1' }
          : { NCR_RAIZ_WEB: arbol.raiz }),
      },
    });
    const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const nombrado = salida.split('\n').find((l) => l.includes('✗') && l.includes(sonda.id));
    if (r.status !== 0 && nombrado !== undefined) {
      console.log(`   ✓ el recorrido lo detecta: ${nombrado.trim()}`);
    } else {
      fallos += 1;
      console.log(
        r.status === 0
          ? `   ✗ con ${sonda.id} reintroducido el recorrido PASA: no lo detecta`
          : `   ✗ el recorrido falla, pero no por ${sonda.id}: la sonda no demuestra nada`,
      );
      for (const l of salida
        .split('\n')
        .filter((x) => x.includes('✗'))
        .slice(0, 6)) {
        console.log(`     ${l.trim()}`);
      }
    }
  } catch (e) {
    fallos += 1;
    console.log(`   ✗ la sonda no pudo montarse: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    arbol.limpiar();
  }
}

console.log(
  corridas === 0
    ? '\nRECORRIDO NEGATIVO: no se ejecutó ninguna sonda, y eso no es un verde'
    : fallos === 0
      ? `\nRECORRIDO NEGATIVO: ${String(corridas)} defecto(s) de sitio reintroducidos, cada uno detectado por su nombre`
      : `\nRECORRIDO NEGATIVO: ${String(fallos)} sonda(s) no demostraron lo que debían`,
);
// Ninguna sonda ejecutada no es un verde: un filtro mal escrito lo dejaría mudo.
process.exit(fallos === 0 && corridas > 0 ? 0 : 1);
