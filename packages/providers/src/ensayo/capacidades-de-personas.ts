import { rutaPara } from '../equipo/catalogo-de-rutas';
import {
  operacionesDeclaradasDeLaBiblioteca,
  tiposDeclaradosDePersona,
} from '../hikvision/rostros-y-personas';
import type { LimitesDeFoto } from '../terminal/foto-del-rostro';
import {
  PROPOSITO_CARGA_SETUP,
  propositoDeLaCarga,
  tipoDePersonaConVigencia,
} from '../terminal/forma-del-alta';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASO 3 · DECISIÓN 8 (15-L) · LO QUE EL EQUIPO DICE ADMITIR EN PERSONAS
 * Y ROSTROS, FRENTE A LO QUE LA PLATAFORMA LE VA A MANDAR
 *
 * La guía no fija un tamaño máximo de foto en KB ni en píxeles: dice que el
 * equipo declara sus límites en sus capacidades. Por eso el límite es del
 * `.env` (EQUIPOS_FOTO_*) y aquí se CONTRASTA con lo que declara el aparato real:
 *  · la biblioteca: qué operaciones admite (`supportFDFunction`), en qué
 *    formatos (`facePicFormat`) y cuántos rostros caben;
 *  · las personas: si admite el alta (`supportFunction` con «post») y cuántas
 *    caben (`maxRecordNum`).
 *
 * R3 (15-N) · el paso NO exige una forma fija («setUp» y «visitor», la de la
 * terminal): en sitio marcaba FALLO al DS-KD9633, que la 15-M da de alta por
 * `post` y como `normal` y que reconoció al visitante. Ahora juzga la forma
 * que SE USARÁ, con la misma decisión (`terminal/forma-del-alta.ts`) y las
 * mismas lecturas (`hikvision/rostros-y-personas.ts`) que el alta real, y la
 * escribe en la nota: tipo de persona y método y ruta de la carga. Sólo es
 * FALLO lo que haría fallar ese alta.
 *
 * Los nombres de campo varían de un firmware a otro en mayúsculas y en
 * anidamiento, así que se buscan por nombre en todo el documento.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface JuicioDePersonas {
  readonly fallos: readonly string[];
  readonly notas: readonly string[];
}

const leerJson = (texto: string | null): unknown => {
  if (texto === null) return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
};

/** El primer valor cuyo nombre case con `patron`, a cualquier profundidad (acotada). */
const buscar = (nodo: unknown, patron: RegExp, profundidad = 0): unknown => {
  if (profundidad > 6 || typeof nodo !== 'object' || nodo === null) return undefined;
  for (const [clave, valor] of Object.entries(nodo)) {
    if (patron.test(clave)) return valor;
  }
  for (const valor of Object.values(nodo)) {
    const hallado = buscar(valor, patron, profundidad + 1);
    if (hallado !== undefined) return hallado;
  }
  return undefined;
};

/** `"a,b"`, `{"@opt":"a,b"}` o `{"@opt":["a","b"]}` → `['a','b']`. */
const opciones = (valor: unknown): string[] | null => {
  const crudo =
    typeof valor === 'object' && valor !== null && '@opt' in valor
      ? (valor as { '@opt': unknown })['@opt']
      : valor;
  if (typeof crudo === 'string') return crudo.split(',').map((s) => s.trim().toLowerCase());
  if (Array.isArray(crudo)) return crudo.map((s) => String(s).trim().toLowerCase());
  return null;
};

const numero = (valor: unknown): number | null => {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
  return Number.isFinite(n) ? n : null;
};

export const juzgarPersonasYRostros = (
  bibliotecaCruda: string | null,
  personasCrudas: string | null,
  limites: LimitesDeFoto,
): JuicioDePersonas => {
  const fallos: string[] = [];
  const notas: string[] = [
    `foto que envía la plataforma: JPEG ≤ ${String(Math.round(limites.bytesMaximos / 1024))} KB ` +
      `y ≤ ${String(limites.ladoMaximo)} px por lado (EQUIPOS_FOTO_KB_MAXIMOS, EQUIPOS_FOTO_LADO_MAXIMO)`,
  ];

  const biblioteca = leerJson(bibliotecaCruda);
  if (biblioteca === null) {
    fallos.push('no se pudo leer qué admite la biblioteca de rostros');
  } else {
    const fallo = falloDeLaCarga(bibliotecaCruda, biblioteca);
    if (fallo !== null) fallos.push(fallo);
    const formatos = opciones(buscar(biblioteca, /^facePicFormat$/i));
    if (formatos !== null && !formatos.some((f) => f === 'jpg' || f === 'jpeg')) {
      fallos.push(`la biblioteca no admite JPEG (admite ${formatos.join(', ')})`);
    }
    const maximo = numero(buscar(biblioteca, /^(FDRecordDataMaxNum|maxFDRecordNum)$/i));
    notas.push(
      `biblioteca de rostros: ${maximo === null ? 'capacidad no declarada' : `hasta ${String(maximo)} rostros`}` +
        (formatos === null ? '' : ` · formatos ${formatos.join(', ')}`),
    );
  }

  const personas = leerJson(personasCrudas);
  if (personas === null) {
    fallos.push('no se pudo leer qué admite la gestión de personas');
    return { fallos, notas };
  }
  const funciones = opciones(buscar(personas, /^supportFunction$/i));
  if (funciones !== null && !funciones.includes('post')) {
    fallos.push(
      `el equipo no declara el alta de personas («post»; declara ${funciones.join(', ')})`,
    );
  }
  const tipos = tiposDeclaradosDePersona(personasCrudas);
  const tipo = tipoDePersonaConVigencia({ tiposDePersona: tipos });
  if (tipos !== undefined && !tipos.map((t) => t.toLowerCase()).includes(tipo)) {
    fallos.push(
      `el equipo no admite ni «visitor» ni «normal» (declara ${tipos.join(', ')}): el alta de ` +
        'un visitante con vigencia fallará en este firmware',
    );
  }
  const maximo = numero(buscar(personas, /^maxRecordNum$/i));
  notas.push(
    `personas: ${maximo === null ? 'capacidad no declarada' : `hasta ${String(maximo)}`}` +
      (funciones === null ? '' : ` · operaciones ${funciones.join(', ')}`),
  );
  const proposito = propositoDeLaCarga({
    operacionesDeBiblioteca: operacionesDeclaradasDeLaBiblioteca(bibliotecaCruda),
  });
  if (fallos.length === 0 && proposito !== null) {
    const persona = rutaPara('dar de alta la persona a la que pertenece la plantilla', 'terminal');
    const carga = rutaPara(proposito, 'terminal');
    notas.push(
      `forma de alta: persona «${tipo}» con su vigencia (${persona.metodo} ${persona.ruta}) · ` +
        `rostro por ${carga.metodo} ${carga.ruta}`,
    );
  }
  return { fallos, notas };
};

/**
 * R3 (15-N) · lo que haría fallar la CARGA del rostro, con la operación que el
 * alta elegirá. El alta lee `FDLibCap.supportFunction` (S-109); la guía del
 * fabricante llama `supportFDFunction` al mismo dato. Si el equipo sólo lo
 * declara ahí y sin «setUp», el alta no lo ve, usará «setUp» y fallará: eso se
 * dice, en vez de dar por buena una carga que no va a entrar.
 */
const falloDeLaCarga = (bibliotecaCruda: string | null, biblioteca: unknown): string | null => {
  const leidas = operacionesDeclaradasDeLaBiblioteca(bibliotecaCruda);
  if (leidas !== undefined) {
    return propositoDeLaCarga({ operacionesDeBiblioteca: leidas }) === null
      ? `la biblioteca no declara ni «setUp» ni «post» (declara ${leidas.join(', ')}): la ` +
          'plataforma no puede cargarle rostros'
      : null;
  }
  const documentadas = opciones(buscar(biblioteca, /^supportFDFunction$/i));
  if (documentadas === null || documentadas.includes('setup')) return null;
  if (!documentadas.includes('post')) {
    return (
      `la biblioteca no declara ni «setUp» ni «post» (declara ${documentadas.join(', ')}): la ` +
      'plataforma no puede cargarle rostros'
    );
  }
  const setUp = rutaPara(PROPOSITO_CARGA_SETUP, 'terminal');
  return (
    `la biblioteca declara sus operaciones en supportFDFunction (${documentadas.join(', ')}) ` +
    `sin «setUp», y el alta las lee en FDLibCap.supportFunction (S-109): usaría ` +
    `${setUp.metodo} ${setUp.ruta} y fallaría. Guarde la respuesta del equipo y repórtela`
  );
};
