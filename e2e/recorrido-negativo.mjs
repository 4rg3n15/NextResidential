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
 *   · H-SITIO-03 · la ruta que lleva la foto del visitante a los equipos
 *                  vuelve a negar al superadministrador → no puede
 *                  generar la autorización con foto. Desde la 15-L esa ruta
 *                  es `POST …/visitas` (F1): la del enlace del titular ya
 *                  no existe (ADR-032).
 *   · H-SITIO-08 · el proxy de la consola vuelve a no exportar PUT → la
 *                  edición no se guarda.
 *
 * Y, desde el anexo de sitio, los dos que viven en el adaptador de equipos
 * (`packages/providers`), que la API del recorrido usa de verdad contra el
 * simulado HTTP:
 *
 *   · H-SITIO-13 · la apertura de la terminal vuelve al cuerpo mínimo, sin
 *                  espacio de nombres → el equipo dice «OK» y la puerta no se
 *                  mueve; la consola, «aceptada».
 *   · H-SITIO-15 · el cliente vuelve a sondear cada escritura con el cuerpo
 *                  vacío, como `curl --digest` → el equipo contesta 400
 *                  badXmlContent antes de autenticar.
 *
 * Un fallo por OTRO motivo no cuenta: si el recorrido se cae antes de llegar a
 * la comprobación, la sonda no ha demostrado nada y lo dice.
 *
 * La API de las sondas se compila con `tsc` en su árbol, como `build`: con
 * `tsx` el ValidationPipe no validaba nada y el historial de eventos daba 400
 * en TODAS las sondas sin que ninguna lo contara (H-SITIO-06, anexo). Por eso
 * las demás faltas del recorrido se imprimen también: una cascada del defecto
 * es esperable; una falta ajena es un aviso. La consola se reutiliza compilada
 * salvo en H-SITIO-08, donde el defecto vive en ella y se compila en el árbol. En H-SITIO-13 y 15 se copia
 * además `packages/providers`, se muta y se compila en el árbol: la API de la
 * sonda carga esa copia y el simulado —que corre en el recorrido, desde el
 * repositorio— sigue siendo el sano, el que dice qué hizo el equipo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
import { arbolDeSonda, raizDelRepositorio } from './arbol-de-sonda.mjs';

const SONDAS = [
  {
    id: 'H-SITIO-02',
    copiar: ['apps/api'],
    fichero: 'apps/api/src/tablero/tablero.module.ts',
    antes: "const enBase = configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres';",
    despues: 'const enBase = false;',
  },
  {
    id: 'H-SITIO-03',
    copiar: ['apps/api'],
    fichero: 'apps/api/src/visitas/presentacion/visitas.controller.ts',
    // Sólo la ruta que GENERA: la lista y las viviendas siguen abiertas, así
    // el recorrido llega al envío y el fallo es el de H-SITIO-03, no otro.
    antes: /@Roles\(\.\.\.CONSOLA\)(\s*@ApiOperation\(\{ summary: 'Genera la autorización)/,
    despues: "@Roles('administrador', 'portero', 'operador_central')$1",
  },
  {
    id: 'H-SITIO-08',
    copiar: ['apps/web'],
    fichero: 'apps/web/src/app/api/ncr/[...ruta]/route.ts',
    antes: 'export const PUT = manejar;',
    despues: '',
  },
  {
    id: 'H-SITIO-13',
    copiar: ['apps/api', 'packages/providers'],
    fichero: 'packages/providers/src/equipo/catalogo-de-rutas.ts',
    antes: 'export const CUERPO_DE_APERTURA_DE_LA_TERMINAL = DOCUMENTO_DE_APERTURA;',
    // Lo que enviaba terminal-facial.ts antes del anexo.
    despues:
      "export const CUERPO_DE_APERTURA_DE_LA_TERMINAL = '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>';",
  },
  {
    id: 'H-SITIO-15',
    copiar: ['apps/api', 'packages/providers'],
    fichero: 'packages/providers/src/equipo/cliente.ts',
    antes: /\(\) =>\s*this\.enviar\(metodo, ruta, cuerpo\),/,
    // El primer envío de cada escritura, el que recibe el desafío, sin cuerpo.
    despues:
      '((sondeo) => () => this.enviar(metodo, ruta, sondeo.n++ === 0 ? undefined : cuerpo))({ n: 0 }),',
  },
];

const soloEstas = (process.env.NCR_SONDAS ?? '').split(',').filter((x) => x !== '');
let fallos = 0;
let corridas = 0;

for (const sonda of SONDAS.filter((s) => soloEstas.length === 0 || soloEstas.includes(s.id))) {
  corridas += 1;
  console.log(`\n▸ ${sonda.id} reintroducido`);
  const arbol = arbolDeSonda({ copiar: sonda.copiar });
  try {
    arbol.mutar(sonda.fichero, sonda.antes, sonda.despues);
    // Primero los paquetes y después las aplicaciones que los cargan.
    for (const copia of [
      ...sonda.copiar.filter((c) => c.startsWith('packages/')),
      ...sonda.copiar.filter((c) => c === 'apps/api'),
    ]) {
      arbol.compilar(copia);
    }
    const enLaApi = sonda.copiar.includes('apps/api');
    const r = spawnSync('node', ['e2e/recorrido-de-consola.mjs'], {
      cwd: raizDelRepositorio,
      encoding: 'utf8',
      timeout: 900_000,
      env: {
        ...process.env,
        ...(enLaApi
          ? { NCR_RAIZ_API: arbol.raiz, NCR_REUTILIZAR_CONSOLA: '1' }
          : { NCR_RAIZ_WEB: arbol.raiz }),
      },
    });
    const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const nombrado = salida.split('\n').find((l) => l.includes('✗') && l.includes(sonda.id));
    if (r.status !== 0 && nombrado !== undefined) {
      console.log(`   ✓ el recorrido lo detecta: ${nombrado.trim()}`);
      for (const l of salida
        .split('\n')
        .filter((x) => x.includes('✗') && x !== nombrado)
        .slice(0, 4)) {
        console.log(`     · también: ${l.trim()}`);
      }
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
