import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { bloques, entero, etiqueta } from '../equipo/xml';
import type { EquipoDeEnsayo, ReceptorEsperado } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C2 (corrección de la 15-L) · ¿PUBLICA LA CÁMARA EN ESTE MAC?
 *
 * La cámara lleva escrita la dirección de su servidor de alarma: IP (o nombre),
 * puerto y ruta. La IP es la del Mac EN LA RED DE LA CÁMARA, y cambia de la
 * casa al sitio y del Wi-Fi al cable. Con la de ayer, la cámara publica a un
 * sitio que ya no existe y el paso 4 esperaba 60 s para decir «no llegó nada»
 * sin decir por qué. Ahora se compara ANTES de pedir el gesto:
 *
 *  · la dirección con `ipHaciaElEquipo` (la del Mac en la subred de la cámara,
 *    o `ALARM_SERVER_IP_ANUNCIADA`);
 *  · el puerto con el `PORT` de la API;
 *  · la ruta con `/alarm-server/<secreto>`, con un secreto de
 *    `ALARM_SERVER_EQUIPOS`: sin él, la API rechaza la publicación.
 *
 * El secreto viaja en la ruta y NUNCA se imprime: la ruta se enseña como
 * `/alarm-server/••••`, sea cual sea el secreto que lleve, conocido o no.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ACCION_DEL_RECEPTOR =
  'En la ficha de la cámara, en la consola, pulse «Enviar eventos a este Mac» y repita el ensayo';

const PREFIJO = 'alarm-server';

export interface ReceptorLeido {
  /** IP o nombre, según la forma de dirección que declara. */
  readonly host: string | null;
  readonly puerto: number | null;
  readonly url: string | null;
}

const noVacio = (v: string | null): string | null => (v === null || v === '' ? null : v);

export const leerReceptoresDelDocumento = (cuerpo: string): readonly ReceptorLeido[] =>
  bloques(cuerpo, 'HttpHostNotification').map((b) => {
    const ip = noVacio(etiqueta(b, 'ipAddress'));
    const nombre = noVacio(etiqueta(b, 'hostName'));
    const porNombre = /^hostname$/i.test(etiqueta(b, 'addressingFormatType') ?? '');
    return {
      host: porNombre ? (nombre ?? ip) : (ip ?? nombre),
      puerto: entero(etiqueta(b, 'portNo')),
      url: noVacio(etiqueta(b, 'url')),
    };
  });

/** `/alarm-server/<secreto>` → `/alarm-server/••••`. Nada después del primer tramo sale. */
export const rutaSinSecreto = (url: string | null): string => {
  if (url === null) return '(sin ruta)';
  const tramos = (url.split('?')[0] ?? '').split('/').filter((t) => t !== '');
  if (tramos.length === 0) return '/';
  return `/${[tramos[0], ...tramos.slice(1).map(() => '••••')].join('/')}`;
};

export interface JuicioDelReceptor {
  readonly conforme: boolean;
  readonly causa: string;
  readonly detalle: readonly string[];
}

const diferencias = (r: ReceptorLeido, ip: string, e: ReceptorEsperado): string[] => {
  const d: string[] = [];
  if ((r.host ?? '').toLowerCase() !== ip.toLowerCase()) {
    d.push(
      r.host === null
        ? 'no tiene dirección'
        : `publica a ${r.host} y este Mac está en ${ip} en la red de la cámara`,
    );
  }
  if (r.puerto !== e.puerto) {
    d.push(`al puerto ${String(r.puerto ?? '(ninguno)')} y la API escucha en ${String(e.puerto)}`);
  }
  const tramos = (r.url?.split('?')[0] ?? '').split('/').filter((t) => t !== '');
  if (tramos[0] !== PREFIJO || tramos.length !== 2) {
    d.push(`con la ruta ${rutaSinSecreto(r.url)}, que no es la del servidor de alarma`);
  } else if (!e.secretos.includes(tramos[1] ?? '')) {
    d.push(
      e.secretos.length === 0
        ? 'y ALARM_SERVER_EQUIPOS está vacía: la API no acredita a ninguna cámara'
        : 'con un secreto que no está en ALARM_SERVER_EQUIPOS: la API rechazará sus eventos',
    );
  }
  return d;
};

export const juzgarReceptorDelMac = (
  receptores: readonly ReceptorLeido[],
  esperado: ReceptorEsperado,
): JuicioDelReceptor => {
  const leidos = receptores.map(
    (r, i) =>
      `receptor ${String(i + 1)} de la cámara: ${r.host ?? '(sin dirección)'}:` +
      `${String(r.puerto ?? '?')} ${rutaSinSecreto(r.url)}`,
  );
  const { direccion } = esperado;
  if (direccion.ip === null) {
    return {
      conforme: false,
      causa: `No se sabe a qué dirección debe publicar la cámara: ${direccion.motivo}`,
      detalle: leidos,
    };
  }
  const donde =
    `este Mac hacia la cámara: ${direccion.ip}` +
    (direccion.origen === 'anunciada'
      ? ' (ALARM_SERVER_IP_ANUNCIADA)'
      : ` (interfaz ${direccion.interfaz ?? '?'}, misma subred)`) +
    ` · API en el puerto ${String(esperado.puerto)}`;
  if (receptores.length === 0) {
    return {
      conforme: false,
      causa: 'La cámara no tiene ningún servidor de alarma configurado: no publica a nadie',
      detalle: [donde],
    };
  }
  const juicios = receptores.map((r) => diferencias(r, direccion.ip, esperado));
  if (juicios.some((d) => d.length === 0)) {
    return {
      conforme: true,
      causa: 'La cámara publica en este Mac',
      detalle: [donde, ...leidos],
    };
  }
  return {
    conforme: false,
    causa: `La cámara NO publica en este Mac: ${(juicios[0] ?? []).join(', ')}`,
    detalle: [donde, ...leidos],
  };
};

/** Lee el receptor de la cámara y lo juzga. `null` si la cámara no lo dijo. */
export const compararReceptorDelMac = async (
  equipo: EquipoDeEnsayo,
  esperado: ReceptorEsperado,
): Promise<JuicioDelReceptor | null> => {
  const ruta = rutaPara('leer a qué receptor publica el equipo', 'camara');
  try {
    const r = await new ClienteDeEquipo(equipo).pedir(ruta.metodo, ruta.ruta);
    if (!r.ok || !/HttpHostNotification/i.test(r.cuerpo)) return null;
    return juzgarReceptorDelMac(leerReceptoresDelDocumento(r.cuerpo), esperado);
  } catch {
    return null;
  }
};
