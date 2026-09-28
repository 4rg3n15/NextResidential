import { resumenIsapi } from './errores-del-fabricante';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C7 (corrección de la 15-L) · LA ESCUCHA QUE NO ENTRA PORQUE OTRA YA ESTÁ
 *
 * Los equipos del conjunto están dados de alta también en HikCentral. Un
 * equipo admite un número pequeño de conexiones de eventos; si HikCentral (o
 * cualquier otra plataforma) ya tiene la suya —o las agotó—, la de la API se
 * rechaza, y hasta ahora el síntoma era «el equipo contestó HTTP 503 a la
 * escucha»: nadie lo relacionaba con la otra plataforma.
 *
 * Esto CLASIFICA el rechazo y lo dice en palabras, con la acción. Es una
 * función pura y exportada para que la escucha (bitácora de la API), el ensayo
 * en sitio y la ficha del equipo en la consola digan LA MISMA frase.
 *
 * `[SUPUESTO]` S-102: la guía del catálogo no trae el código con el que el
 * equipo rechaza una conexión de eventos por límite o por otra plataforma. Se
 * reconocen: HTTP 503 y 429, el «Device Busy» del código de estado general
 * (statusCode 2, documentado) y `subStatusCode`/`errorMsg` que hablen de
 * enlaces, máximos o armado (`deviceBusy`, `maxLink…`, `linkNum…`, `overMax…`,
 * `alreadyArmed`, `armed`, `occupied`, `inUse`). El ensayo en sitio anota el
 * cuerpo de verdad, y si es otro, se añade AQUÍ.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ClaseDeRechazoDeEventos = 'limite_de_conexiones' | 'otra_plataforma';

export interface ConexionDeEventosRechazada {
  readonly clase: ClaseDeRechazoDeEventos;
  /** Por qué, en palabras. */
  readonly motivo: string;
  /** Qué hacer. */
  readonly remedio: string;
  /** `motivo`, «→» y `remedio`: la frase entera, igual en el ensayo y en la ficha. */
  readonly frase: string;
}

export const REMEDIO_OTRA_PLATAFORMA =
  'deshabilite el equipo en HikCentral durante la prueba (o quítele la suscripción de ' +
  'eventos) y vuelva a conectar';

const OTRA_PLATAFORMA = /alreadyArm|armed|arming|otherPlatform|occupied|inUse|beingUsed/i;
const LIMITE = /deviceBusy|\bbusy\b|maxLink|linkNum|overMax|connectionLimit|limitReached|tooMany/i;

export const clasificarConexionDeEventosRechazada = (
  estadoHttp: number,
  cuerpo: string,
): ConexionDeEventosRechazada | null => {
  if (estadoHttp >= 200 && estadoHttp < 300) return null;
  // La credencial y la ruta tienen su propio diagnóstico: no son «otra plataforma».
  if (estadoHttp === 401 || estadoHttp === 404) return null;
  const r = resumenIsapi(cuerpo);
  const dicho = [r.subStatusCode, r.errorMsg, r.statusString].filter((x) => x !== null).join(' ');
  const codigo = r.subStatusCode === null ? '' : ` (${r.subStatusCode})`;
  const armar = (clase: ClaseDeRechazoDeEventos, motivo: string): ConexionDeEventosRechazada => ({
    clase,
    motivo,
    remedio: REMEDIO_OTRA_PLATAFORMA,
    frase: `${motivo} → ${REMEDIO_OTRA_PLATAFORMA}`,
  });
  if (OTRA_PLATAFORMA.test(dicho)) {
    return armar(
      'otra_plataforma',
      `el equipo rechazó la conexión de eventos (HTTP ${String(estadoHttp)}${codigo}) porque ` +
        'otra plataforma —p. ej. HikCentral— ya la tiene',
    );
  }
  if (estadoHttp === 503 || estadoHttp === 429 || r.statusCode === 2 || LIMITE.test(dicho)) {
    return armar(
      'limite_de_conexiones',
      `el equipo rechazó la conexión de eventos (HTTP ${String(estadoHttp)}${codigo}): ya tiene ` +
        'el máximo de conexiones abiertas, probablemente las de otra plataforma —p. ej. HikCentral—',
    );
  }
  return null;
};
