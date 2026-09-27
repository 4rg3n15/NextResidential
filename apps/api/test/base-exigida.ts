import { beforeEach } from 'vitest';
import { getCurrentTest } from 'vitest/suite';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA OMISIÓN NO ES UN VERDE · el único sitio que lee `DATABASE_URL_PRUEBAS`
 *
 * H-15L-C01 · la lista de visitas del residente salía SIEMPRE vacía contra
 * PostgreSQL, y la prueba que lo habría cazado estaba en verde. No mentía: no
 * hacía nada. La base local estaba caída, su `beforeAll` dejó `disponible` en
 * falso y cada prueba salió por `if (omitida()) return;`. Una prueba que
 * retorna antes de su primera aserción PASA, y el resumen seguía diciendo
 * «passed». Con `--con-base` el verificador prometía base, y nada comprobaba
 * que cada suite la tuviera de verdad: el paso 1 mira la base una vez, y una
 * base que se cae después —o una variable que no llega— no la veía nadie.
 *
 * La regla, desde la 15-L: **con `--con-base`, omitir por falta de base es un
 * FALLO, y con nombre**. El verificador exporta `NCR_BASE_EXIGIDA=1`
 * (declarada en `turbo.json`: sin eso, turbo la filtra) y este módulo la aplica:
 *
 *  · sin `DATABASE_URL_PRUEBAS` y exigida → el fichero NO CARGA: el error
 *    sale con su nombre, antes de que un `describe.skipIf` lo salte entero;
 *  · `exigirBase(motivo, disponible)` → antes de CADA prueba del bloque, si la
 *    base no está: exigida, la prueba FALLA con «fichero › bloque › prueba» y
 *    el motivo; no exigida, se anuncia `OMITIDA:` y queda MARCADA en el
 *    informe JSON (`meta.omitidaSinBase`). Su cuerpo hace el `return` de
 *    siempre: el guardián va antes, así que da igual cómo esté escrito;
 *  · `omitirSinBase(motivo)` → lo mismo, para la precondición de datos que
 *    falta A MITAD de una prueba.
 *
 * Y la segunda barrera no depende de que la variable llegue: el paso 5 lee
 * los informes con `scripts/lib/omisiones-sin-base.mjs`, que NOMBRA cada
 * prueba marcada o fallada por esto y, con `--con-base`, las cuenta como
 * fallo. Si mañana `turbo.json` deja de declarar `NCR_BASE_EXIGIDA`, las
 * pruebas volverían a «pasar» — marcadas, y el paso 5 se pondría rojo igual.
 *
 * El mismo control exige que ningún otro fichero de prueba lea la variable por
 * su cuenta, y que quien importe de aquí registre el guardián.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** La base de pruebas. Vacía cuenta como ausente, como en el paso 1. */
const cruda = process.env.DATABASE_URL_PRUEBAS;
export const URL_BASE: string | undefined = cruda === undefined || cruda === '' ? undefined : cruda;

/** `--con-base`: la base es obligatoria y omitir es fallar. */
export const BASE_EXIGIDA = process.env.NCR_BASE_EXIGIDA === '1';

/**
 * El texto que lleva el fallo. Lo busca `omisiones-sin-base.mjs` en los
 * informes: cambiarlo aquí sin cambiarlo allí deja de nombrar las omisiones.
 */
export const MARCA_DE_OMISION = 'OMISIÓN POR FALTA DE BASE con --con-base';

if (BASE_EXIGIDA && URL_BASE === undefined) {
  throw new Error(
    `${MARCA_DE_OMISION}: NCR_BASE_EXIGIDA=1 y DATABASE_URL_PRUEBAS no llega a esta suite. ` +
      '¿La filtra turbo.json (env de la tarea test)?',
  );
}

interface Bloque {
  readonly name: string;
  readonly suite?: Bloque | undefined;
}
interface TareaConNombre extends Bloque {
  readonly meta: object;
  readonly file?: { readonly name: string } | undefined;
}

/** «fichero › bloque › prueba», como lo nombra el informe. */
const nombreDe = (tarea: TareaConNombre): string => {
  const partes = [tarea.name];
  // Acotado por la profundidad real de los `describe`: cada vuelta sube uno.
  for (let b = tarea.suite; b !== undefined; b = b.suite) {
    if (b.name !== '' && b.name !== tarea.file?.name) partes.unshift(b.name);
  }
  if (tarea.file !== undefined) partes.unshift(tarea.file.name);
  return partes.join(' › ');
};

const omitir = (tarea: TareaConNombre, motivo: string): void => {
  const nombre = nombreDe(tarea);
  if (BASE_EXIGIDA) throw new Error(`${MARCA_DE_OMISION} · ${nombre}: ${motivo}`);
  Object.assign(tarea.meta, { omitidaSinBase: motivo });
  // La omisión se ANUNCIA en la salida: es la marca que el paso 13 del verificador
  // busca, y la que lee quien corre la suite a mano.
  // eslint-disable-next-line no-console -- ver arriba
  console.log(`OMITIDA: ${nombre}: ${motivo} (se exige con --con-base)`);
};

/**
 * El guardián del bloque que necesita la base. Se registra DENTRO del
 * `describe` —o en la raíz del fichero si todo él la necesita— y se evalúa
 * antes de cada prueba, cuando los `beforeAll` ya dejaron `disponible` escrito.
 */
export const exigirBase = (motivo: string, disponible: () => boolean): void => {
  beforeEach(({ task }) => {
    if (!disponible()) omitir(task, motivo);
  });
};

/**
 * Una omisión a mitad de prueba —falta un dato sembrado, no la base—: la
 * misma regla. Se usa como `if (...) { omitirSinBase('...'); return; }`.
 */
export const omitirSinBase = (motivo: string): void => {
  const tarea = getCurrentTest();
  if (tarea === undefined) throw new Error(`omitirSinBase fuera de una prueba: ${motivo}`);
  omitir(tarea, motivo);
};
