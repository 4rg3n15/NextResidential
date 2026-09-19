#!/usr/bin/env node
/**
 * CONTROLES DECLARADOS NO EJERCIDOS · declarados, no desactivados.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA DIFERENCIA, QUE ES TODA LA CUESTIÓN
 *
 * Desactivar un control es borrarlo y no volver a acordarse. Declararlo es
 * dejarlo **en la salida de cada ejecución**, con su motivo escrito, la fecha
 * en que se declaró y la etapa en que se revisa. El veredicto lo dice en su
 * línea final: una etapa correcta CON controles declarados no es lo mismo que
 * una etapa correcta, y quien lea la salida tiene que verlo sin buscarlo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y CADUCAN
 *
 * Una declaración sin fecha de revisión es una desactivación con buenos
 * modales. Por eso cada una nombra la etapa que la revisa, y **cuando esa etapa
 * se cierra en `docs/ESTADO_ETAPAS.md` la declaración caduca**: el control
 * falla y hay que ejercer el paso o volver a declararlo a la vista de lo que se
 * sepa entonces. Es el mismo trinquete que la deuda de pruebas negativas: la
 * lista solo puede encoger sola, nunca crecer en silencio.
 *
 *   node scripts/lib/controles-declarados.mjs <paso>   → 0 si está declarado
 *   node scripts/lib/controles-declarados.mjs --auditar
 */
import { readFileSync, existsSync } from 'node:fs';

const ESTADO = 'docs/ESTADO_ETAPAS.md';

/** paso → declaración. Cada entrada exige motivo, desde y revisión. */
export const DECLARADOS = new Map([
  [
    '5e',
    {
      desde: '2026-09-19',
      revision: 'ETAPA 14',
      titulo: 'el recorrido de la app en un navegador',
      motivo:
        'diferencia de ENTORNO en el enganche del campo por el motor de Flutter web: ' +
        'bajo Chromium en macOS el <input> recibe las pulsaciones —la instrumentación ' +
        'lee el valor de vuelta— y el widget no se entera, así que su validador sigue ' +
        'reclamando el campo. Reproducible en macOS, no en Linux. No es un fallo de la ' +
        'app: los otros tres controles móviles (análisis estático, 72 pruebas con ' +
        'cobertura por capa, cliente generado sin diferencias ni secretos) sí se ejercen',
      revisaCuando: 'el CI tenga entorno estable y se pueda fijar navegador y motor',
    },
  ],
]);

const argumentos = process.argv.slice(2);

/** Una declaración caduca cuando su etapa de revisión ya está CERRADA. */
const caducadas = () => {
  if (!existsSync(ESTADO)) return [];
  const texto = readFileSync(ESTADO, 'utf8');
  const vencidas = [];
  for (const [paso, d] of DECLARADOS) {
    // La ficha de la etapa en el documento: «## ETAPA 14 — … · **CERRADA** …».
    const ficha = new RegExp(`^## ${d.revision} —.*$`, 'mi').exec(texto)?.[0] ?? '';
    if (/\bCERRADA\b/.test(ficha)) {
      vencidas.push(
        `el paso ${paso} se declaró hasta ${d.revision}, y ${d.revision} ya está CERRADA: ` +
          'o se ejerce o se vuelve a declarar con lo que se sepa hoy',
      );
    }
  }
  return vencidas;
};

if (argumentos[0] === '--auditar') {
  const faltas = [];
  for (const [paso, d] of DECLARADOS) {
    for (const campo of ['desde', 'revision', 'motivo', 'titulo', 'revisaCuando']) {
      if (typeof d[campo] !== 'string' || d[campo].trim() === '') {
        faltas.push(`la declaración del paso ${paso} no escribe \`${campo}\``);
      }
    }
  }
  const vencidas = caducadas();
  if (faltas.length > 0 || vencidas.length > 0) {
    console.error('FALLO las declaraciones de «no ejercido» no están en regla:');
    for (const f of [...faltas, ...vencidas]) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `declaraciones: ${DECLARADOS.size} paso(s) declarado(s) no ejercido(s), con motivo y etapa de revisión vigente`,
  );
  process.exit(0);
}

const paso = argumentos[0];
const declaracion = paso === undefined ? undefined : DECLARADOS.get(paso);
if (declaracion === undefined) process.exit(1);

console.log(
  `${declaracion.titulo} — DECLARADO NO EJERCIDO desde ${declaracion.desde}, ` +
    `revisión en ${declaracion.revision}`,
);
console.log(`motivo: ${declaracion.motivo}`);
console.log(`se revisa cuando: ${declaracion.revisaCuando}`);
