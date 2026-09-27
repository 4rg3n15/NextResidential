import { randomBytes } from 'node:crypto';
import { IMAGEN_SIN_ROSTRO } from '../diagnostico/imagen-sin-rostro';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import { motivoLegible } from '../nucleo/motivo-legible';
import { exigirFotoAdmisible, FotoNoAdmitida } from '../terminal/foto-del-rostro';
import { REMEDIO_OTRA_PLATAFORMA } from '../equipo/conexion-de-eventos-rechazada';
import { rostroDePrueba } from './rostro-de-prueba';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo, ResultadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASO 6 · ALTA Y BAJA DE UN ROSTRO DE PRUEBA, EN CADA EQUIPO QUE LOS LLEVA
 *
 * La terminal, siempre. El videoportero, según DECLARE (F4, corrección de la
 * 15-L): con biblioteca, el mismo alta → búsqueda → baja que la terminal; sin
 * ella, NO APLICA; y si no se pudo leer, FALLO con el motivo que dio el equipo
 * —hasta ahora se tomaba por «no declara» y el paso decía NO APLICA a un
 * videoportero que quizá sí los llevaba—.
 *
 * C7 · entre el alta y la baja, la espera de `--espera-sincronizacion` (60 s):
 * si otra plataforma borra el rostro, se ve aquí y no con la primera visita.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ESPERA_DE_SINCRONIZACION_POR_OMISION_MS = 60_000;

const SOLO_LECTURA = 'Modo solo lectura: no se acciona ni se escribe nada en el equipo';

/** `null` si el equipo lleva rostros; si no, el resultado que lo dice. */
const siNoLlevaRostros = (
  o: OpcionesDeEnsayo,
  c: CapacidadesDeEquipo | null,
): ResultadoDePaso | null => {
  if (o.equipo.familia === 'terminal') return null;
  if (o.equipo.familia === 'camara') {
    return resultado('rostro', 'no_aplica', 'La cámara no lleva rostros');
  }
  const biblioteca = c?.bibliotecaDeRostros;
  if (biblioteca?.estado === 'si') return null;
  if (biblioteca?.estado === 'no') {
    return resultado(
      'rostro',
      'no_aplica',
      'Este equipo no declara biblioteca de rostros: la sincronización lo omite y lo dice',
    );
  }
  return resultado(
    'rostro',
    'fallo',
    c === null
      ? 'No se pudieron leer las capacidades del videoportero: no se sabe si lleva rostros'
      : `No se pudo leer si el videoportero tiene biblioteca de rostros: ${
          biblioteca?.motivo ?? 'el equipo no dijo por qué'
        }`,
    'Compruebe en su panel web que el usuario de servicio tenga permiso de control de acceso ' +
      '(personas y rostros); repita «Probar conexión» en la consola y el ensayo. Mientras, la ' +
      'sincronización NO le envía rostros',
  );
};

export const pasoDeRostro = async (
  o: OpcionesDeEnsayo,
  capacidades: CapacidadesDeEquipo | null,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((listo) => setTimeout(listo, ms)),
): Promise<ResultadoDePaso> => {
  const noLleva = siNoLlevaRostros(o, capacidades);
  if (noLleva !== null) return noLleva;
  if (o.soloLectura) return resultado('rostro', 'omitido', SOLO_LECTURA);
  if (o.foto !== undefined) {
    try {
      exigirFotoAdmisible(o.foto, o.limitesDeFoto);
    } catch (error) {
      return resultado(
        'rostro',
        'fallo',
        `La foto de --foto no sirve: ${error instanceof FotoNoAdmitida ? error.legible : motivoLegible(error)}`,
        'Use un JPEG de una sola cara, de frente, dentro de los límites de EQUIPOS_FOTO_*',
      );
    }
  }
  // Sin foto real, la imagen sintética: prueba el canal, pero no el alta.
  const esperaMs = o.esperaDeSincronizacionMs ?? ESPERA_DE_SINCRONIZACION_POR_OMISION_MS;
  const r = await rostroDePrueba(
    o.equipo,
    o.foto ?? IMAGEN_SIN_ROSTRO,
    `ENSAYO${randomBytes(4).toString('hex')}`,
    esperaMs,
    esperar,
  );
  const tras =
    esperaMs >= 1000 ? `${String(Math.round(esperaMs / 1000))} s` : `${String(esperaMs)} ms`;
  const detalle = [`persona de prueba: ${r.employeeNo}`];
  if (r.baja === null || !r.baja.ok || r.errorDeSupresion !== null) {
    return resultado(
      'rostro',
      'fallo',
      `La persona de prueba pudo QUEDAR en el equipo: ${
        r.errorDeSupresion ?? r.errorDeBaja ?? 'la baja no se confirmó'
      }`,
      `Bórrela a mano en el panel web (Persona → buscar ${r.employeeNo} → eliminar)`,
      detalle,
    );
  }
  if (!r.aceptada) {
    return resultado(
      'rostro',
      'fallo',
      `El equipo no aceptó el rostro: ${r.rechazo ?? 'sin motivo'}`,
      o.foto === undefined
        ? 'Repita con --foto=<JPEG de una cara real>: la imagen de prueba no tiene rostro y el ' +
            'equipo de verdad la rechaza así. La persona de prueba ya se dio de baja'
        : 'Pruebe otra foto: una sola cara, de frente y bien iluminada',
      detalle,
    );
  }
  if (r.seguiaTrasLaEspera === false) {
    return resultado(
      'rostro',
      'fallo',
      `El rostro de prueba DESAPARECIÓ del equipo en ${tras}: otra plataforma —p. ej. ` +
        'HikCentral— sincronizó el equipo y borró el rostro',
      `${REMEDIO_OTRA_PLATAFORMA.charAt(0).toUpperCase()}${REMEDIO_OTRA_PLATAFORMA.slice(1)}: ` +
        'si no, borrará también cada rostro que envíe la plataforma',
      detalle,
    );
  }
  return resultado(
    'rostro',
    'ok',
    (r.seguiaTrasLaEspera === true
      ? `Alta de persona y rostro aceptada, seguía en el equipo a los ${tras}, `
      : 'Alta de persona y rostro aceptada, ') +
      'supresión verificada por búsqueda y baja confirmada',
    null,
    r.seguiaTrasLaEspera === null
      ? [...detalle, `⚠ a los ${tras} el equipo no contestó a la búsqueda del rostro`]
      : detalle,
  );
};
