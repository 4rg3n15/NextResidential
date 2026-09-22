/**
 * QUIÉN PUEDE PUBLICAR EN EL ALARM SERVER, Y CON QUÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO VIVE EN `comun` Y NO DENTRO DEL MÓDULO QUE LO USA
 *
 * Porque lo necesitan DOS capas que no pueden importarse entre sí: el módulo
 * del receptor, que acredita con ello, y el esquema de configuración, que tiene
 * que **rechazar una declaración mal formada al arrancar**. El control D-91 lo
 * exige y tiene razón: tolerar la variable vacía no puede convertirse en
 * tolerar cualquier cosa. Si el esquema alcanzara el interior del módulo
 * rompería la frontera de §2.2, y si cada uno validara por su cuenta las dos
 * validaciones se separarían. `comun` es fontanería sin dominio propio y sin
 * frontera: es el sitio.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * H-15-1 · ESTA AUTENTICACIÓN ES MÁS DÉBIL QUE LA FIRMA, Y SE DICE AQUÍ
 *
 * `POST /ingesta/eventos` exige HMAC sobre el cuerpo con ventana de frescura
 * (RNF-03.11). **La cámara no firma**: publica un `multipart/form-data` sin
 * ninguna prueba de autoría, y no hay ajuste del equipo que lo cambie. Así que
 * este extremo se acredita con lo único que el aparato puede ofrecer:
 *
 *  1. un **secreto largo por equipo**, que viaja en la ruta o en `Basic`, y
 *  2. la **dirección de origen** del propio equipo, que tiene que coincidir.
 *
 * Lo que esto NO da, y callarlo sería justo lo que audita la ETAPA 13:
 *
 * | Propiedad                     | Firma HMAC | Aquí                            |
 * | ----------------------------- | ---------- | ------------------------------- |
 * | Integridad del cuerpo         | Sí         | **No**                          |
 * | Anti repetición               | Sí         | **No**                          |
 * | Resiste a quien vea la URL    | Sí         | **No** — el secreto es la URL   |
 * | Resiste a suplantación de IP  | n/a        | **No** en una red plana         |
 *
 * **Endurecimiento pendiente, por orden de valor:** (1) VLAN dedicada de
 * equipos, que convierte la comprobación de origen en una barrera real;
 * (2) TLS con certificado de cliente, si el firmware lo admite —sin confirmar—;
 * (3) rotación del secreto por equipo con el procedimiento de la guía. Mientras
 * (1) no exista, **la medida real es la segmentación de red, no este fichero**.
 */

export interface EquipoDeclarado {
  readonly dispositivoId: string;
  readonly copropiedadId: string;
  readonly secreto: string;
  readonly origenesPermitidos: readonly string[];
}

/** Por debajo de esto, el secreto es adivinable y no se admite. */
export const LONGITUD_MINIMA_DE_SECRETO = 32;

export class DeclaracionDeEquiposInvalida extends Error {
  constructor(readonly motivos: readonly string[]) {
    super(`ALARM_SERVER_EQUIPOS mal formada: ${motivos.join(' · ')}`);
    this.name = 'DeclaracionDeEquiposInvalida';
  }
}

/**
 * `copropiedad|dispositivo|secreto|ip[,ip]` y `;` entre equipos.
 *
 * **Falla al arrancar y no en la primera petición.** Una entrada con el secreto
 * corto o sin origen deja un extremo abierto en un sitio donde nadie mira hasta
 * que hay un incidente; que la aplicación no arranque es lo que obliga a
 * mirarlo ahora (§2.7.1).
 */
export const leerEquiposDeclarados = (crudo: string | undefined): readonly EquipoDeclarado[] => {
  const texto = (crudo ?? '').trim();
  if (texto === '') return [];

  const motivos: string[] = [];
  const equipos: EquipoDeclarado[] = [];

  texto
    .split(';')
    .map((e) => e.trim())
    .filter((e) => e !== '')
    .forEach((entrada, indice) => {
      const donde = `entrada ${String(indice + 1)}`;
      const campos = entrada.split('|').map((c) => c.trim());
      if (campos.length !== 4) {
        motivos.push(`${donde}: se esperan 4 campos «copropiedad|dispositivo|secreto|ips»`);
        return;
      }
      const [copropiedadId, dispositivoId, secreto, ips] = campos as [
        string,
        string,
        string,
        string,
      ];

      if (copropiedadId === '') motivos.push(`${donde}: falta la copropiedad`);
      if (dispositivoId === '') motivos.push(`${donde}: falta el dispositivo`);
      if (secreto.length < LONGITUD_MINIMA_DE_SECRETO) {
        motivos.push(
          `${donde}: el secreto tiene ${String(secreto.length)} caracteres y el mínimo es ` +
            `${String(LONGITUD_MINIMA_DE_SECRETO)}`,
        );
      }
      const origenes = ips
        .split(',')
        .map((i) => i.trim())
        .filter((i) => i !== '');
      if (origenes.length === 0) {
        motivos.push(
          `${donde}: sin origen declarado. Es la mitad de la acreditación (H-15-1): ` +
            'un secreto sin origen es una URL que abre una puerta desde cualquier sitio',
        );
      }

      if (motivos.length === 0) {
        equipos.push({ copropiedadId, dispositivoId, secreto, origenesPermitidos: origenes });
      }
    });

  const repetidos = equipos
    .map((e) => e.dispositivoId)
    .filter((id, i, todos) => todos.indexOf(id) !== i);
  if (repetidos.length > 0) motivos.push(`dispositivos repetidos: ${repetidos.join(', ')}`);

  if (motivos.length > 0) throw new DeclaracionDeEquiposInvalida(motivos);
  return equipos;
};

/**
 * Comparación en tiempo CONSTANTE.
 *
 * Una comparación normal termina en el primer carácter distinto, y el tiempo
 * que tarda dice cuántos acertó. Con un extremo que admite reintentos, eso se
 * convierte en adivinar el secreto carácter a carácter.
 */
export const coincideEnTiempoConstante = (a: string, b: string): boolean => {
  // Longitudes distintas: se recorre igual para no filtrar la longitud, pero el
  // resultado ya es falso.
  const largo = Math.max(a.length, b.length);
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < largo; i += 1) {
    diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferencia === 0;
};

/** Normaliza el origen: IPv6 con IPv4 dentro, y el `::ffff:` de los sockets. */
export const normalizarOrigen = (crudo: string | undefined | null): string => {
  const valor = (crudo ?? '').trim();
  const sinPrefijo = /^::ffff:(.+)$/i.exec(valor)?.[1] ?? valor;
  return sinPrefijo.toLowerCase();
};

export const buscarEquipoPorSecreto = (
  equipos: readonly EquipoDeclarado[],
  secreto: string,
): EquipoDeclarado | null => {
  // Se recorren TODOS aunque ya haya coincidencia: salir antes filtra la
  // posición del equipo en la lista por el tiempo de respuesta.
  let encontrado: EquipoDeclarado | null = null;
  for (const equipo of equipos) {
    if (coincideEnTiempoConstante(equipo.secreto, secreto)) encontrado = equipo;
  }
  return encontrado;
};

export const origenAdmisible = (equipo: EquipoDeclarado, origen: string | undefined): boolean =>
  equipo.origenesPermitidos.map(normalizarOrigen).includes(normalizarOrigen(origen));
