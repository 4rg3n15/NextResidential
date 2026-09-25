/**
 * A4 (15-E) · Vive en `comun` y no en el módulo de guardia a propósito: `main.ts` y el
 * banco de pruebas la montan ANTES de cargar los módulos, y una arista nueva
 * desde ahí hacia el barril de guardia entraba al ciclo eventos↔autorizaciones
 * por el lado equivocado (D-66: el orden de carga de los barriles importa).
 *
 * el trozo de audio del operador llega como `application/octet-stream`
 * y `express.json` no lo parsea: `main.ts` monta `express.raw` SÓLO bajo esta
 * ruta, antes de los demás parsers, igual que el sobre del servidor de alarma.
 * Sin esto el cuerpo llegaría vacío y el POST diría «no vacío» a todo.
 */
export const RUTA_DE_AUDIO_DE_INTERCOM = '/copropiedades/:id/guardia/intercom/:dispositivoId/audio';

/** Un trozo de 20-200 ms de G.711 a 8 kHz son 160-1600 bytes: 64 KiB sobra. */
export const LIMITE_DE_TROZO_DE_AUDIO = '64kb';
