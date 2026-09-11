import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Códigos de recuperación del segundo factor.
 *
 * **Qué NO hacen, y es lo primero que hay que entender.** Un código de
 * recuperación **no da acceso**. No puede: el `aal2` que exige el guard lo
 * emite Supabase al verificar un factor, y ADR-008 fijó que ese es el único
 * emisor. Lo que un código autoriza es **retirar el factor perdido** para poder
 * inscribir otro. Es la salida a «perdí el teléfono», que Supabase no cubre —su
 * respuesta es inscribir varios factores, lo que no sirve si solo había uno—,
 * y lo hace sin reabrir la decisión de ADR-008: quien emite el segundo factor
 * sigue siendo Supabase.
 *
 * Este módulo vuelve a introducir lo que la ETAPA 03 tenía y ADR-008 retiró
 * junto con el TOTP propio. Se retiró bien: allí los códigos eran la vía a un
 * segundo factor paralelo. Aquí son una llave de un solo uso para desbloquear
 * la reinscripción, y no compiten con nada.
 *
 * Tres propiedades, y las tres importan:
 *
 * 1. **Solo se guarda el hash.** El código en claro se entrega una vez. Si se
 *    guardara, quien leyera la tabla podría retirar el segundo factor de
 *    cualquiera — que es exactamente el ataque del que protege el segundo
 *    factor.
 * 2. **Un solo uso.** Consumido, no vuelve a valer. Sin eso, un código
 *    filtrado sirve para siempre.
 * 3. **Comparación en tiempo constante.** La comparación de cadenas de
 *    JavaScript termina en el primer byte distinto, y esa diferencia de tiempo
 *    es medible.
 */

/** Diez códigos: suficientes para varios incidentes, pocos para apuntarlos mal. */
export const CANTIDAD_DE_CODIGOS = 10;

/**
 * Forma `XXXXX-XXXXX` en hexadecimal. 40 bits de entropía por código: con el
 * límite de peticiones de §2.7.5 —cinco por minuto— adivinar uno tarda del
 * orden de cien mil años.
 */
const generarUno = (): string => {
  const bytes = randomBytes(5).toString('hex').toUpperCase();
  return `${bytes.slice(0, 5)}-${bytes.slice(5, 10)}`;
};

export const normalizarCodigo = (codigo: string): string =>
  codigo.trim().toUpperCase().replace(/\s+/g, '');

/**
 * SHA-256 y no un hash de contraseña deliberadamente lento.
 *
 * Un bcrypt o un argon2 protegen contra fuerza bruta sobre secretos de baja
 * entropía —contraseñas que la gente elige—. Estos códigos tienen 40 bits
 * aleatorios: no hay diccionario contra el que atacarlos, y el coste de un hash
 * lento se pagaría en cada verificación de los diez códigos.
 */
export const hashDeCodigo = (codigo: string): string =>
  createHash('sha256').update(normalizarCodigo(codigo), 'utf8').digest('hex');

export interface CodigosGenerados {
  /** En claro. Se entregan UNA vez y no se guardan. */
  readonly codigos: readonly string[];
  /** Lo único que se persiste. */
  readonly hashes: readonly string[];
}

export const generarCodigosDeRecuperacion = (
  cantidad: number = CANTIDAD_DE_CODIGOS,
): CodigosGenerados => {
  const codigos: string[] = [];
  // Se comprueba la unicidad aunque la probabilidad de choque sea ínfima: un
  // duplicado dejaría al usuario con nueve códigos creyendo que tiene diez.
  while (codigos.length < cantidad) {
    const nuevo = generarUno();
    if (!codigos.includes(nuevo)) codigos.push(nuevo);
  }
  return { codigos, hashes: codigos.map(hashDeCodigo) };
};

/**
 * Compara en tiempo constante. Devuelve el hash que casó, o `null`.
 *
 * Recorre **todos** los candidatos aunque ya haya encontrado uno: salir antes
 * haría que el tiempo dependiera de la posición del código en la lista.
 */
export const casarCodigo = (
  codigo: string,
  hashesVigentes: readonly string[],
): string | null => {
  const objetivo = Buffer.from(hashDeCodigo(codigo), 'utf8');
  let encontrado: string | null = null;
  for (const hash of hashesVigentes) {
    const candidato = Buffer.from(hash, 'utf8');
    if (candidato.length !== objetivo.length) continue;
    if (timingSafeEqual(candidato, objetivo)) encontrado = hash;
  }
  return encontrado;
};
