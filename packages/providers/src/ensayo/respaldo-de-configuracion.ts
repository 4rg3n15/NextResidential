import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { interpretarError } from '../equipo/errores-del-fabricante';
import { etiqueta } from '../equipo/xml';
import { motivoLegible } from '../nucleo/motivo-legible';
import type { EquipoDeEnsayo, FamiliaDeEnsayo } from './tipos';
import { juzgarZona } from './zona-del-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J2 (ETAPA 15-L) · LA CONFIGURACIÓN DE CADA EQUIPO, ANTES Y DESPUÉS
 *
 * `--capturar` guarda, ANTES de tocar nada, los documentos de configuración
 * que la entrega puede cambiar —quién controla la barrera, a qué receptor
 * publica la cámara, si la terminal espera el veredicto, los canales de
 * audio…—, tal como los devuelve el equipo. `--restaurar` los devuelve.
 *
 * Tres reglas:
 *  · Sólo se escribe lo que CAMBIÓ: un recurso igual al respaldo no se toca.
 *  · Lo escrito se VUELVE A LEER. Un «OK» no demuestra nada: en sitio, un
 *    documento sin espacio de nombres contestó «OK» y no cambió nada.
 *  · Un respaldo de otro equipo NO se aplica: se compara la serie.
 *
 * Un documento con una contraseña dentro no se guarda con ella: se borra y el
 * recurso queda como «no restaurable», para repetirlo a mano. Las credenciales
 * viven sólo en el `.env` (RN-21).
 *
 * R2 (15-N) · LA ZONA Y LA HORA NO SE RESTAURAN. El respaldo guarda el
 * documento de hora del equipo SÓLO PARA LEER (`horaDelEquipo`): devolver una
 * hora capturada días atrás es atrasar el reloj a propósito, que es lo que
 * dejó al videoportero 13 h atrás el 29/09. No hay bandera que lo haga: la
 * hora se corrige en el equipo, con NTP. Al restaurar se AVISA si la zona del
 * respaldo no es la del conjunto (`avisoDeZona`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
interface Recurso {
  readonly clave: string;
  readonly leer: string;
  readonly escribir: string;
  readonly familiaDeRuta: 'camara' | 'terminal' | 'videoportero';
  readonly conCarril?: boolean;
  /** La lista de canales de audio se lee entera y se escribe canal a canal. */
  readonly porCanalDeAudio?: boolean;
}

const RECURSOS: Readonly<Record<FamiliaDeEnsayo, readonly Recurso[]>> = {
  camara: [
    {
      clave: 'quien-controla-la-barrera',
      leer: 'leer quién controla la barrera: la cámara o la plataforma',
      escribir: 'corregir quién controla la barrera',
      familiaDeRuta: 'camara',
    },
    {
      clave: 'receptor-de-eventos',
      leer: 'leer a qué receptor publica el equipo',
      escribir: 'apuntar el equipo a nuestro receptor',
      familiaDeRuta: 'camara',
    },
    {
      clave: 'disparador-de-deteccion',
      leer: 'leer si un disparador vinculado acciona la barrera',
      escribir: 'configurar el disparador de detección de vehículo',
      familiaDeRuta: 'camara',
      conCarril: true,
    },
    {
      clave: 'pais-del-algoritmo',
      leer: 'leer el país con el que el algoritmo lee las placas',
      escribir: 'fijar el país del algoritmo',
      familiaDeRuta: 'camara',
      conCarril: true,
    },
  ],
  terminal: [
    {
      clave: 'verificacion-remota',
      leer: 'leer si la terminal espera el veredicto de la plataforma',
      escribir: 'fijar que la terminal espere el veredicto de la plataforma',
      familiaDeRuta: 'terminal',
    },
  ],
  videoportero: [
    {
      clave: 'canales-de-audio',
      leer: 'leer los canales de audio bidireccional del equipo',
      escribir: 'configurar un canal de audio bidireccional',
      familiaDeRuta: 'videoportero',
      porCanalDeAudio: true,
    },
  ],
};

export interface DocumentoRespaldado {
  readonly clave: string;
  readonly tipo: 'application/xml' | 'application/json';
  readonly contenido: string | null;
  readonly restaurable: boolean;
  readonly nota: string | null;
}

export interface RespaldoDeEquipo {
  readonly version: 1;
  readonly familia: FamiliaDeEnsayo;
  readonly capturadoEn: string;
  readonly serie: string | null;
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly documentos: readonly DocumentoRespaldado[];
  /** R2 (15-N) · `/ISAPI/System/time` tal cual, para leer: NUNCA se restaura. */
  readonly horaDelEquipo?: string | null;
}

export interface ResultadoDeRestauracion {
  readonly clave: string;
  readonly estado: 'igual' | 'restaurado' | 'fallo' | 'no_restaurable';
  readonly detalle: string;
}

const CONTRASENA = /(<password>)[^<]+(<\/password>)|("password"\s*:\s*")[^"]+(")/gi;
const NO_SOPORTADO = /notSupport|invalidOperation|notSupported/i;

/** Igual para el equipo: sin prólogo, sin espacios entre etiquetas, JSON ordenado. */
export const canonico = (texto: string): string => {
  const t = texto.trim();
  if (t.startsWith('{')) {
    try {
      const ordenar = (v: unknown): unknown =>
        Array.isArray(v)
          ? v.map(ordenar)
          : typeof v === 'object' && v !== null
            ? Object.fromEntries(
                Object.entries(v)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, x]) => [k, ordenar(x)]),
              )
            : v;
      return JSON.stringify(ordenar(JSON.parse(t)));
    } catch {
      return t;
    }
  }
  return t
    .replace(/^<\?xml[^>]*\?>/, '')
    .replace(/>\s+</g, '><')
    .trim();
};

const ruta = (r: Recurso, proposito: string, equipo: EquipoDeEnsayo, canal?: number) =>
  rutaPara(proposito, r.familiaDeRuta, canal ?? (r.conCarril === true ? equipo.puerta : undefined));

const leer = async (cliente: ClienteDeEquipo, r: Recurso, e: EquipoDeEnsayo): Promise<string> => {
  const l = ruta(r, r.leer, e);
  const respuesta = await cliente.pedir(l.metodo, l.ruta);
  if (!respuesta.ok || NO_SOPORTADO.test(respuesta.cuerpo)) {
    throw new Error(interpretarError(respuesta.cuerpo).detalle);
  }
  return respuesta.cuerpo;
};

/**
 * OTROS FALLOS (15-M) · el respaldo se identifica por FAMILIA y SERIE, las dos.
 *
 * En el ensayo simulado todos los equipos decían la misma serie: con la serie
 * sola como llave, la reversión de la cámara encontró el respaldo del
 * videoportero y lo rechazó por ser de otra familia, y la segunda cámara pisó
 * el fichero de la primera sin decirlo. En sitio dos familias no comparten
 * serie, pero dos fichas que apuntan al MISMO aparato (IP repetida en el
 * registro) sí: eso se dice, no se sobrescribe.
 */
export const ficheroDelRespaldo = (familia: FamiliaDeEnsayo, serie: string): string =>
  `${familia}-${serie.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

export const llaveDelRespaldo = (familia: FamiliaDeEnsayo, serie: string): string =>
  `${familia}|${serie}`;

/**
 * El respaldo de ESTE equipo entre los leídos de la carpeta, o `null`. Nunca
 * uno de otra familia aunque la serie coincida.
 */
export const respaldoPara = <R extends Pick<RespaldoDeEquipo, 'familia' | 'serie'>>(
  respaldos: readonly R[],
  familia: FamiliaDeEnsayo,
  serie: string,
): R | null => respaldos.find((r) => r.familia === familia && r.serie === serie) ?? null;

/**
 * C6 (15-M) · la SERIE del equipo, leída del propio aparato. Es lo que
 * identifica un respaldo: con N equipos de la misma familia el nombre del
 * fichero ya no puede ser la familia. `null` si el equipo no dijo quién es.
 */
export const leerSerieDelEquipo = async (equipo: EquipoDeEnsayo): Promise<string | null> => {
  const cliente = new ClienteDeEquipo(equipo);
  const id = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');
  const identidad = await cliente.pedir(id.metodo, id.ruta);
  return identidad.ok ? etiqueta(identidad.cuerpo, 'serialNumber') : null;
};

export const capturarRespaldo = async (
  equipo: EquipoDeEnsayo,
  ahora: Date,
): Promise<RespaldoDeEquipo> => {
  const cliente = new ClienteDeEquipo(equipo);
  const id = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');
  const identidad = await cliente.pedir(id.metodo, id.ruta);
  if (!identidad.ok) throw new Error('el equipo no dijo quién es: sin su serie no hay respaldo');
  const documentos: DocumentoRespaldado[] = [];
  for (const r of RECURSOS[equipo.familia]) {
    try {
      const cuerpo = await leer(cliente, r, equipo);
      const conClave = CONTRASENA.test(cuerpo);
      CONTRASENA.lastIndex = 0;
      documentos.push({
        clave: r.clave,
        tipo: cuerpo.trim().startsWith('{') ? 'application/json' : 'application/xml',
        contenido: cuerpo.replace(CONTRASENA, '$1$2$3$4'),
        restaurable: !conClave,
        nota: conClave ? 'lleva una contraseña: se guardó sin ella y se restaura a mano' : null,
      });
    } catch (error) {
      documentos.push({
        clave: r.clave,
        tipo: 'application/xml',
        contenido: null,
        restaurable: false,
        nota: `no se pudo leer: ${motivoLegible(error)}`,
      });
    }
  }
  // R2 (15-N) · la hora y la zona, para LEER al restaurar; nunca para escribir.
  let horaDelEquipo: string | null = null;
  try {
    const h = rutaPara('leer la hora del equipo', 'comun');
    const r = await cliente.pedir(h.metodo, h.ruta);
    horaDelEquipo = r.ok && !NO_SOPORTADO.test(r.cuerpo) ? r.cuerpo : null;
  } catch {
    horaDelEquipo = null;
  }
  return {
    version: 1,
    horaDelEquipo,
    familia: equipo.familia,
    capturadoEn: ahora.toISOString(),
    serie: etiqueta(identidad.cuerpo, 'serialNumber'),
    modelo: etiqueta(identidad.cuerpo, 'model'),
    firmware: etiqueta(identidad.cuerpo, 'firmwareVersion'),
    documentos,
  };
};

/** Cada canal de una lista de audio, como documento propio con su espacio de nombres. */
const canalesDe = (lista: string): Map<number, string> => {
  const espacio = /xmlns="([^"]+)"/.exec(lista)?.[1] ?? 'http://www.isapi.org/ver20/XMLSchema';
  const canales = new Map<number, string>();
  for (const m of lista.matchAll(/<TwoWayAudioChannel\b[^>]*>([\s\S]*?)<\/TwoWayAudioChannel>/g)) {
    const id = Number(etiqueta(m[0], 'id'));
    if (!Number.isInteger(id)) continue;
    canales.set(
      id,
      '<?xml version="1.0" encoding="UTF-8"?>' +
        `<TwoWayAudioChannel version="2.0" xmlns="${espacio}">${m[1] ?? ''}</TwoWayAudioChannel>`,
    );
  }
  return canales;
};

const escribir = async (
  cliente: ClienteDeEquipo,
  r: Recurso,
  e: EquipoDeEnsayo,
  d: DocumentoRespaldado & { contenido: string },
  actual: string,
): Promise<void> => {
  const pares: [number | undefined, string][] =
    r.porCanalDeAudio === true
      ? [...canalesDe(d.contenido)]
          .filter(([id, doc]) => canonico(doc) !== canonico(canalesDe(actual).get(id) ?? ''))
          .map(([id, doc]) => [id, doc])
      : [[undefined, d.contenido]];
  for (const [canal, contenido] of pares) {
    const w = ruta(r, r.escribir, e, canal);
    const respuesta = await cliente.pedir(w.metodo, w.ruta, { tipo: d.tipo, contenido });
    if (!respuesta.ok || NO_SOPORTADO.test(respuesta.cuerpo)) {
      throw new Error(interpretarError(respuesta.cuerpo).detalle);
    }
  }
};

export const restaurarRespaldo = async (
  equipo: EquipoDeEnsayo,
  respaldo: RespaldoDeEquipo,
): Promise<readonly ResultadoDeRestauracion[]> => {
  const cliente = new ClienteDeEquipo(equipo);
  const id = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');
  const identidad = await cliente.pedir(id.metodo, id.ruta);
  const serie = identidad.ok ? etiqueta(identidad.cuerpo, 'serialNumber') : null;
  if (respaldo.familia !== equipo.familia || serie === null || serie !== respaldo.serie) {
    return [
      {
        clave: '(todo)',
        estado: 'fallo',
        detalle:
          'el respaldo es de OTRO equipo (o éste no dijo su serie): no se aplica nada. ' +
          'Compruebe que la IP del .env sea la del equipo respaldado',
      },
    ];
  }
  const resultados: ResultadoDeRestauracion[] = [];
  for (const d of respaldo.documentos) {
    const r = RECURSOS[equipo.familia].find((x) => x.clave === d.clave);
    if (r === undefined || !d.restaurable || d.contenido === null) {
      resultados.push({
        clave: d.clave,
        estado: 'no_restaurable',
        detalle: d.nota ?? 'desconocido',
      });
      continue;
    }
    try {
      const actual = await leer(cliente, r, equipo);
      if (canonico(actual) === canonico(d.contenido)) {
        resultados.push({
          clave: d.clave,
          estado: 'igual',
          detalle: 'ya estaba como en el respaldo',
        });
        continue;
      }
      await escribir(cliente, r, equipo, { ...d, contenido: d.contenido }, actual);
      const despues = await leer(cliente, r, equipo);
      resultados.push(
        canonico(despues) === canonico(d.contenido)
          ? { clave: d.clave, estado: 'restaurado', detalle: 'escrito y releído igual al respaldo' }
          : {
              clave: d.clave,
              estado: 'fallo',
              detalle:
                'el equipo aceptó la escritura pero la lectura posterior NO coincide: ' +
                'restáurelo a mano en su panel web',
            },
      );
    } catch (error) {
      resultados.push({ clave: d.clave, estado: 'fallo', detalle: motivoLegible(error) });
    }
  }
  return resultados;
};

/**
 * R2 (15-N) · si el respaldo trae una zona distinta de la del conjunto, se
 * dice al restaurar (y no se restaura: la zona no está entre los recursos).
 * `null` si coincide o si el respaldo no la trae.
 */
export const avisoDeZona = (
  respaldo: Pick<RespaldoDeEquipo, 'horaDelEquipo'>,
  zonaDelConjunto: string,
  ahora: Date,
): string | null => {
  if (respaldo.horaDelEquipo === undefined || respaldo.horaDelEquipo === null) return null;
  const juicio = juzgarZona(respaldo.horaDelEquipo, zonaDelConjunto, ahora);
  return juicio.correcta === false
    ? `el respaldo trae otra zona horaria (${juicio.detalle}); NO se restaura: la zona y la ` +
        'hora se fijan en el equipo con NTP y la zona del conjunto'
    : null;
};
