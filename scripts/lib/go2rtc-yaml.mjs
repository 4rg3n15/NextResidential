/**
 * E2/C1 (15-M) · el `go2rtc.yaml` sin la clave `streams:`.
 *
 * go2rtc escribe en su fichero los flujos dados de alta con `PUT` —la URL RTSP
 * con la credencial— y, con un `streams: {}` escrito a mano, rechaza el alta
 * con «did not find expected key». La API registra con `PATCH` (en memoria),
 * así que el fichero no debe llevar la clave nunca; esto retira el bloque de
 * primer nivel `streams:` con todo lo indentado debajo, y deja el resto igual.
 *
 * Es una función pura para poder probarla sin arrancar nada.
 */
export const yamlSinStreams = (texto) => {
  const lineas = texto.split(/\r?\n/);
  const salida = [];
  let dentro = false;
  for (const linea of lineas) {
    if (/^streams\s*:/.test(linea)) {
      dentro = true;
      continue;
    }
    if (dentro && (/^\s/.test(linea) || linea.trim() === '' || /^\s*#/.test(linea))) continue;
    dentro = false;
    salida.push(linea);
  }
  return salida.join('\n');
};
