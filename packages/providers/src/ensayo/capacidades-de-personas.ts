import type { LimitesDeFoto } from '../terminal/foto-del-rostro';

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
 *  · las personas: si admite el alta (`supportFunction` con «post»), cuántas
 *    caben (`maxRecordNum`) y si conoce el tipo «visitor» que escribe A2.
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
    const funciones = opciones(buscar(biblioteca, /^supportFDFunction$/i));
    if (funciones !== null && !funciones.includes('setup')) {
      fallos.push(
        `la biblioteca no declara «setUp» (declara ${funciones.join(', ')}): la carga de ` +
          'rostros de la plataforma usa esa operación',
      );
    }
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
  const tipos = opciones(buscar(personas, /^userType$/i));
  if (tipos !== null && !tipos.includes('visitor')) {
    fallos.push(
      `el equipo no conoce el tipo «visitor» (conoce ${tipos.join(', ')}): el alta de un ` +
        'visitante con vigencia fallará en este firmware',
    );
  }
  const maximo = numero(buscar(personas, /^maxRecordNum$/i));
  notas.push(
    `personas: ${maximo === null ? 'capacidad no declarada' : `hasta ${String(maximo)}`}` +
      (funciones === null ? '' : ` · operaciones ${funciones.join(', ')}`),
  );
  return { fallos, notas };
};
