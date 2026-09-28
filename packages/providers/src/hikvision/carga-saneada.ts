/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL EQUIPO MANDÓ, TAL CUAL, PERO SIN LO QUE NO DEBE GUARDARSE
 *
 * El Bloque B guarda cada evento con su carga para que, ante un código que
 * nadie catalogó, se pueda ver qué dijo el equipo. Guardarla entera no se
 * puede: un bloque puede traer la foto en base64, una URL con credencial o
 * texto con caracteres de control. Aquí se copia el bloque:
 *
 *  · sin claves de credencial ni de imagen (se dice que se quitaron);
 *  · con los textos recortados a 200 caracteres y sin caracteres de control;
 *  · con la profundidad acotada (4) y un techo de 4 KB, porque la tabla lo
 *    exige (CHECK de la 0040) y porque un evento no es un volcado.
 *
 * Si aun así no cabe, queda sólo lo de primer nivel. Nunca lanza.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PROHIBIDAS =
  /pass(word)?|clave|secret|token|auth|cookie|picture|image|imagen|foto|photo|base64|jpe?g|png|filePath|url/i;
const MAXIMO_DE_TEXTO = 200;
const PROFUNDIDAD_MAXIMA = 4;
export const TECHO_DE_CARGA = 4096;

const texto = (valor: string): string =>
  // eslint-disable-next-line no-control-regex
  valor.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAXIMO_DE_TEXTO);

const copiar = (valor: unknown, profundidad: number): unknown => {
  if (typeof valor === 'string') return texto(valor);
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'boolean' || valor === null) return valor;
  if (profundidad >= PROFUNDIDAD_MAXIMA) return '…';
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => copiar(v, profundidad + 1));
  if (typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>).slice(0, 60)) {
      salida[texto(clave).slice(0, 60)] = PROHIBIDAS.test(clave)
        ? '[retirado]'
        : copiar(v, profundidad + 1);
    }
    return salida;
  }
  return null;
};

export const cargaSaneada = (bloque: unknown): Readonly<Record<string, unknown>> => {
  const copia = copiar(bloque, 0);
  if (typeof copia !== 'object' || copia === null || Array.isArray(copia)) return {};
  const objeto = copia as Record<string, unknown>;
  if (JSON.stringify(objeto).length <= TECHO_DE_CARGA) return objeto;
  // No cabe: lo de primer nivel que sea escalar, y la marca de que se recortó.
  const plano: Record<string, unknown> = { recortada: true };
  for (const [clave, v] of Object.entries(objeto)) {
    if (typeof v !== 'object' || v === null) plano[clave] = v;
  }
  return JSON.stringify(plano).length <= TECHO_DE_CARGA ? plano : { recortada: true };
};
