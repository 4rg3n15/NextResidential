/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E3 (15-M) · CÓMO SE DA DE ALTA UN ROSTRO, SEGÚN LO QUE EL EQUIPO DECLARA
 *
 * El videoportero DS-KD9633 guarda rostros como la terminal, pero declara
 * otras cosas: en la gestión de personas `userType` sólo admite `normal`, y
 * en la biblioteca de rostros la operación `post` y NO `setUp`. El alta que
 * servía para la terminal (`userType: visitor` y `PUT …/FDSetUp`) fallaría
 * en él con un 400 que se leería como «foto rechazada».
 *
 * Aquí se decide por CAPACIDADES, nunca por modelo: se mira lo que el equipo
 * contestó a sus consultas de capacidades y nada más.
 *
 *  · Tipo de persona con vigencia: `visitor` si el equipo lo admite o no lo
 *    dijo (lo de siempre, S-69); `normal` si declara la lista y `visitor` no
 *    está. Con `normal` la vigencia viaja igual en `Valid`, y la gobierna la
 *    plataforma (RN-11): la supresión llega al vencer, lo diga o no el tipo.
 *  · Operación de la carga: `setUp` (PUT FDSetUp) si la declara o no dijo
 *    nada —lo de siempre—; `post` (POST FaceDataRecord) si declara `post` sin
 *    `setUp`; ninguna de las dos: `null`, y quien llama NO prueba otra ruta
 *    por analogía (`RutaNoSoportada`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface DeclaradoParaElAlta {
  /** `UserInfo/capabilities` → `userType.@opt`, si el equipo lo declaró. */
  readonly tiposDePersona?: readonly string[] | undefined;
  /** `FDLib/capabilities` → `supportFunction.@opt`, si el equipo lo declaró. */
  readonly operacionesDeBiblioteca?: readonly string[] | undefined;
}

export const PROPOSITO_CARGA_SETUP = 'cargar la plantilla facial';
export const PROPOSITO_CARGA_POST = 'añadir la plantilla facial a la biblioteca';

const minusculas = (lista: readonly string[]): readonly string[] =>
  lista.map((x) => x.trim().toLowerCase());

/** Una lista `@opt` («post,delete,put») como la dan estos equipos; `undefined` si no hay. */
export const listaDeclarada = (valor: unknown): readonly string[] | undefined => {
  const opt =
    typeof valor === 'object' && valor !== null && '@opt' in valor
      ? (valor as Record<string, unknown>)['@opt']
      : valor;
  if (typeof opt !== 'string') return undefined;
  const lista = opt
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');
  return lista.length === 0 ? undefined : lista;
};

export const tipoDePersonaConVigencia = (d: DeclaradoParaElAlta): 'visitor' | 'normal' =>
  d.tiposDePersona === undefined || minusculas(d.tiposDePersona).includes('visitor')
    ? 'visitor'
    : 'normal';

export const propositoDeLaCarga = (d: DeclaradoParaElAlta): string | null => {
  if (d.operacionesDeBiblioteca === undefined) return PROPOSITO_CARGA_SETUP;
  const ops = minusculas(d.operacionesDeBiblioteca);
  if (ops.includes('setup')) return PROPOSITO_CARGA_SETUP;
  if (ops.includes('post')) return PROPOSITO_CARGA_POST;
  return null;
};
