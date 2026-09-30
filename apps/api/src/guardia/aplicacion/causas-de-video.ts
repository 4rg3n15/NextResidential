/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E2/C1 (15-M) · LO QUE CONTESTA EL PUENTE, EN PALABRAS CON REMEDIO
 *
 * En sitio (28/09) la consola enseñó «HTTP 500 · EOF» y nadie supo qué hacer
 * con eso. El puente (go2rtc) habla en texto técnico y la API es quien sabe
 * qué significa cada uno en ESTE despliegue: un puente apagado, un fichero de
 * configuración con una clave sobrante, un equipo que corta la conexión, un
 * canal que no existe, una credencial sin permiso de vista en vivo. Cada causa
 * se dice con la acción que la corrige; el texto técnico va detrás, entre
 * paréntesis, para quien tenga que buscarlo. Sin marca ni protocolo del
 * fabricante aquí: es la capa de aplicación (KPI-11).
 *
 * El motivo llega YA REDACTADO por el adaptador (`redactar` quita todo
 * `rtsp://…`): estas frases no pueden reintroducir una credencial porque nunca
 * la ven.
 * ═════════════════════════════════════════════════════════════════════════════
 */
interface Causa {
  readonly patron: RegExp;
  readonly frase: string;
}

const CAUSAS: readonly Causa[] = [
  {
    patron: /ECONNREFUSED|fetch failed|TimeoutError|timed out|aborted|ENOTFOUND|EAI_AGAIN/i,
    frase:
      'go2rtc no está en marcha o no escucha en GO2RTC_URL: arránquelo en el Mac con ' +
      '`pnpm sitio:video` y compruebe la URL en apps/api/.env',
  },
  {
    patron: /did not find expected key|yaml/i,
    frase:
      'go2rtc rechazó el registro por su fichero de configuración (una clave `streams:` ' +
      'sobrante): pare el puente y vuelva a arrancarlo con `pnpm sitio:video`, que lo regenera',
  },
  {
    patron: /\b412\b|Precondition Failed/i,
    frase:
      'el equipo no tiene ese canal de video: elija otro canal en la ficha del equipo ' +
      '(la lista muestra los que declara; el subflujo x02 es el que ve la consola)',
  },
  {
    // V5 (15-N) · lo que go2rtc dice cuando el equipo rechaza la credencial RTSP.
    patron: /\b401\b|Unauthorized|wrong user\/pass/i,
    frase:
      'el equipo rechazó la credencial por RTSP: el usuario de servicio necesita permiso de ' +
      'vista en vivo en el panel del equipo (Usuarios → permisos → Vista en directo)',
  },
  {
    patron: /\b404\b|Not Found|stream not found/i,
    frase:
      'el puente no conoce el flujo o el equipo no tiene ese camino: reintente y, si ' +
      'persiste, revise el canal en la ficha y reinicie `pnpm sitio:video`',
  },
  {
    // V5 (15-N) · go2rtc no dice cuál: 403, 404, 412 o 454. La API pregunta al
    // equipo cuando puede; si no, esto.
    patron: /wrong response on DESCRIBE/i,
    frase:
      'el equipo rechazó el flujo pedido (canal inexistente, usuario sin permiso de vista en ' +
      'vivo o sesiones agotadas): pulse «Probar conexión» en la ficha para saber cuál',
  },
  {
    // V5 (15-N) · la oferta del navegador rechazada por el puente (SDP ilegible).
    patron: /sdp:|SessionDescription|invalid (?:offer|sdp)|unmarshal/i,
    frase:
      'el puente rechazó la oferta de video del navegador: recargue la consola; si persiste, ' +
      'el navegador no es compatible (use Chrome, Edge o Safari actuales)',
  },
  {
    patron: /EOF|\b551\b|Option not supported|connection reset|ECONNRESET|broken pipe/i,
    frase:
      'el equipo cerró la conexión de video (backchannel u otro rechazo del flujo): la API ' +
      'actual ya pide el flujo sin canal de retorno; compruebe que el canal de la ficha ' +
      'existe y que el usuario de servicio tiene permiso de vista en vivo',
  },
  {
    patron: /i\/o timeout|dial tcp|EHOSTUNREACH|no route to host|network is unreachable/i,
    frase:
      'el puente no llega al equipo por RTSP: compruebe la red del Mac hacia el equipo y ' +
      'VIDEO_PUERTO_RTSP en apps/api/.env',
  },
  {
    patron: /la respuesta no es SDP/i,
    frase:
      'el puente contestó algo que no es una respuesta de video: compruebe que GO2RTC_URL ' +
      'apunta a la API de go2rtc y no a otro servicio',
  },
];

/** La causa en palabras, con el texto técnico detrás; si no se reconoce, el texto tal cual. */
export const explicarFalloDelPuente = (motivo: string): string => {
  const causa = CAUSAS.find((c) => c.patron.test(motivo));
  return causa === undefined ? motivo : `${causa.frase} (${motivo})`;
};
