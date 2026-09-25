import type { CapacidadesDeEquipo, EstadoDeCapacidad } from '../nucleo/capacidades';
import { CAPACIDADES_SIN_CONSULTAR, capacidadesDescubiertas } from '../nucleo/capacidades';
import { CredencialRechazada } from '../nucleo/errores';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import type { RutaDeEquipo } from '../equipo/catalogo-de-rutas';
import { bloques, etiqueta } from '../equipo/xml';
import { CARRIL_VERIFICADO_DE_LA_CAMARA } from '../camara/carril';

/**
 * DE LO QUE EL EQUIPO DECLARA A LO QUE EL SISTEMA PREGUNTA · ETAPA 15-D (O2).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ÉSTE ES EL ÚNICO SITIO QUE CONOCE LOS NOMBRES DE CAMPO DEL FABRICANTE
 *
 * `isSupportRemoteOpenDoor`, `isSupportCallSignal`, `isSupportSubscribeEvent`,
 * `ITCCap`, `AudioCap`: son las claves de los volcados REALES de los dos
 * equipos del proyecto (`docs/insumos/hikvision/hik-*.xml`, capturados el
 * 23/09/2026). Fuera de este fichero el sistema habla de `aperturaRemota`,
 * `senalizacionDeLlamada` o `suscripcionDeEventos`, y no sabe cómo se llaman
 * en ninguna marca.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * PROCEDENCIA, CLAVE POR CLAVE
 *
 * | Capacidad neutral        | Clave del fabricante                 | Respaldo                    |
 * | ------------------------ | ------------------------------------ | --------------------------- |
 * | aperturaRemota           | VideoIntercomCap.isSupportRemoteOpenDoor | volcado real del portero |
 * | senalizacionDeLlamada    | VideoIntercomCap.isSupportCallSignal | volcado real (`false`)      |
 * | suscripcionDeEventos     | SysCap.isSupportSubscribeEvent       | volcados reales (ambos)     |
 * | reconocimientoDePlacas   | ITCCap.isSupportVehicleDetection     | volcado real de la cámara   |
 * | audioBidireccional       | SysCap.AudioCap + lista de canales   | volcado real + DOCUMENTADA  |
 * | bibliotecaDeRostros      | FDLib capabilities / Count           | DOCUMENTADA, NO VERIFICADA  |
 * | verificacionRemota       | AcsCfg.remoteCheck                   | DOCUMENTADA, NO VERIFICADA  |
 * | gestionDePersonas        | AccessControl capabilities (UserInfo)| DOCUMENTADA, NO VERIFICADA  |
 * | estadoDeBarrera          | BarrierGateCap.isSupportBarrierGateStatus | guía oficial           |
 *
 * Lo DOCUMENTADO se comprueba en sitio con `scripts/puesta-en-marcha-equipos.mjs`
 * y, si la clave real es otra, se cambia AQUÍ y en ningún otro sitio.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE NO CONTESTA QUEDA `desconocida`, NO `no`
 *
 * Un `404` o un `notSupport` a la consulta de capacidades no demuestra que el
 * equipo no pueda: demuestra que ese firmware no lo DECLARA por esa ruta. Se
 * deja `desconocida`, el consumidor lo niega por defecto y el motivo dice que
 * fue por no saber, que es distinto de «el equipo dijo que no».
 */

const booleano = (valor: string | null): EstadoDeCapacidad =>
  valor === null
    ? 'desconocida'
    : /^true$/i.test(valor)
      ? 'si'
      : /^false$/i.test(valor)
        ? 'no'
        : 'desconocida';

/** Lo que el documento de capacidades del sistema declara, familia aparte. */
export const capacidadesDesdeDeviceCap = (xml: string): Partial<CapacidadesDeEquipo> => {
  const intercom = bloques(xml, 'VideoIntercomCap')[0] ?? '';
  const sistema = bloques(xml, 'SysCap')[0] ?? '';
  const itc = bloques(xml, 'ITCCap')[0] ?? '';
  const audio = bloques(sistema, 'AudioCap')[0] ?? null;
  const entradas = audio === null ? null : etiqueta(audio, 'audioInputNums');
  const salidas = audio === null ? null : etiqueta(audio, 'audioOutputNums');
  const tieneAudio: EstadoDeCapacidad =
    audio === null
      ? 'desconocida'
      : Number(entradas ?? '0') > 0 && Number(salidas ?? '0') > 0
        ? 'si'
        : 'no';
  return {
    aperturaRemota: booleano(etiqueta(intercom, 'isSupportRemoteOpenDoor')),
    senalizacionDeLlamada: booleano(etiqueta(intercom, 'isSupportCallSignal')),
    suscripcionDeEventos: booleano(etiqueta(sistema, 'isSupportSubscribeEvent')),
    reconocimientoDePlacas: booleano(etiqueta(itc, 'isSupportVehicleDetection')),
    audioBidireccional: { estado: tieneAudio, canal: null, formato: null },
  };
};

export interface CanalDeAudioDeclarado {
  readonly id: number;
  readonly habilitado: boolean | null;
  /** Códec tal como lo nombra el equipo, y su equivalente neutro. */
  readonly codec: string | null;
  readonly formato: string | null;
}

/** `G.711ulaw` → `g711u`; lo que no se conoce se conserva en minúsculas. */
const formatoNeutro = (codec: string | null): string | null => {
  if (codec === null) return null;
  const c = codec.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^g711u/.test(c) || c === 'g711ulaw') return 'g711u';
  if (/^g711a/.test(c) || c === 'g711alaw') return 'g711a';
  if (/^g726/.test(c)) return 'g726';
  if (/^aac/.test(c)) return 'aac';
  return c === '' ? null : c;
};

/**
 * La lista de canales de audio bidireccional, tal como el equipo la declara.
 *
 * **Es la corrección de D4.** El canal NO es 1 por omisión: se lee de aquí y
 * se usa el primero habilitado. Un `channels/1/open` escrito a mano contra un
 * equipo cuyo canal es el 2 contesta `notSupport` y el diagnóstico apunta al
 * firmware.
 */
export const canalesDeAudioDesde = (xml: string): readonly CanalDeAudioDeclarado[] =>
  bloques(xml, 'TwoWayAudioChannel').map((canal) => ({
    id: Number(etiqueta(canal, 'id') ?? '0'),
    habilitado:
      etiqueta(canal, 'enabled') === null ? null : /^true$/i.test(etiqueta(canal, 'enabled') ?? ''),
    codec: etiqueta(canal, 'audioCompressionType'),
    formato: formatoNeutro(etiqueta(canal, 'audioCompressionType')),
  }));

/** El canal con el que se abre el audio: el primero habilitado, si lo hay. */
export const canalDeAudioUtilizable = (
  canales: readonly CanalDeAudioDeclarado[],
): CanalDeAudioDeclarado | null => canales.find((c) => c.habilitado === true && c.id > 0) ?? null;

/**
 * Verificación remota de la terminal: ¿espera al veredicto de la plataforma?
 *
 * **DOCUMENTADA, NO VERIFICADA.** El campo y su forma (`AcsCfg.remoteCheck`)
 * salen de la documentación de control de acceso del fabricante, no de una
 * captura de esta terminal. Es un `[SUPUESTO]` S-35 que el guion de puesta en
 * marcha confirma; si la clave real es otra, se cambia aquí.
 */
export const verificacionRemotaDesde = (json: string): EstadoDeCapacidad => {
  try {
    const objeto: unknown = JSON.parse(json);
    if (typeof objeto !== 'object' || objeto === null) return 'desconocida';
    const raiz = objeto as Record<string, unknown>;
    const acs = (raiz['AcsCfg'] ?? raiz) as Record<string, unknown>;
    const valor = acs['remoteCheck'];
    return valor === true ? 'si' : valor === false ? 'no' : 'desconocida';
  } catch {
    return 'desconocida';
  }
};

export interface EstadoDeBiblioteca {
  readonly estado: EstadoDeCapacidad;
  readonly maximo: number | null;
  readonly almacenadas: number | null;
}

/**
 * Biblioteca de rostros: cuántas plantillas caben y cuántas hay.
 *
 * La segunda cifra es la que hace VERIFICABLE una supresión (RN-11): después
 * de suprimir, el recuento tiene que bajar. Un `OK` a la orden no lo demuestra.
 */
export const bibliotecaDesde = (
  capacidadesJson: string | null,
  recuentoJson: string | null,
): EstadoDeBiblioteca => {
  const leerNumero = (json: string | null, claves: readonly string[]): number | null => {
    if (json === null) return null;
    try {
      const objeto: unknown = JSON.parse(json);
      if (typeof objeto !== 'object' || objeto === null) return null;
      let actual: unknown = objeto;
      for (const clave of claves) {
        if (typeof actual !== 'object' || actual === null) return null;
        actual = (actual as Record<string, unknown>)[clave];
      }
      if (typeof actual === 'object' && actual !== null && '@max' in actual) {
        const max = (actual as Record<string, unknown>)['@max'];
        return typeof max === 'number' ? max : null;
      }
      return typeof actual === 'number' && Number.isFinite(actual) ? actual : null;
    } catch {
      return null;
    }
  };
  const maximo = leerNumero(capacidadesJson, ['FDLibCap', 'maxFDRecordNum']);
  const almacenadas = leerNumero(recuentoJson, ['FDRecordCount', 'totalNum']);
  return {
    estado: capacidadesJson === null && recuentoJson === null ? 'desconocida' : 'si',
    maximo,
    almacenadas,
  };
};

export interface OpcionesDeDescubrimiento {
  readonly cliente: ClienteDeEquipo;
  readonly familia: RutaDeEquipo['familia'];
  /** Para nombrar al equipo en el error de credencial. */
  readonly dispositivoId?: string;
  /** Carril de la cámara. Si no se declaró, el VERIFICADO (`camara/carril.ts`). */
  readonly canal?: number;
}

const rechazado = (cuerpo: string): boolean =>
  /notSupport|invalidOperation|notSupported/i.test(cuerpo);

/**
 * Pregunta al aparato lo que puede hacer. **No lanza**: lo que no contesta
 * queda `desconocida`, salvo que el equipo esté inalcanzable, que sí se lanza
 * porque no se sabe nada de él y disimularlo produciría unas capacidades
 * «descubiertas» sin haber hablado con nadie.
 */
export const descubrirCapacidades = async (
  opciones: OpcionesDeDescubrimiento,
): Promise<CapacidadesDeEquipo> => {
  const { cliente, familia } = opciones;
  const pedir = async (proposito: string, fam = familia): Promise<string | null> => {
    let ruta: RutaDeEquipo;
    try {
      ruta = rutaPara(proposito, fam, opciones.canal ?? CARRIL_VERIFICADO_DE_LA_CAMARA);
    } catch {
      return null;
    }
    const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta);
    // Una credencial rechazada NO es «no declara»: es un error propio, se
    // lanza y NO se reintenta (bloquea la cuenta del equipo).
    if (respuesta.estado === 401 || respuesta.estado === 403) {
      throw new CredencialRechazada(opciones.dispositivoId ?? cliente.destino);
    }
    if (!respuesta.ok || rechazado(respuesta.cuerpo)) return null;
    return respuesta.cuerpo;
  };

  const sistema = await pedir('leer las capacidades del equipo', 'comun');
  const base = sistema === null ? {} : capacidadesDesdeDeviceCap(sistema);

  const parciales: { -readonly [K in keyof CapacidadesDeEquipo]?: CapacidadesDeEquipo[K] } = {
    ...base,
  };

  if (familia === 'videoportero' || familia === 'terminal') {
    const canales = await pedir(
      'leer los canales de audio bidireccional del equipo',
      'videoportero',
    );
    const lista = canales === null ? [] : canalesDeAudioDesde(canales);
    const util = canalDeAudioUtilizable(lista);
    parciales.audioBidireccional = {
      estado:
        canales === null
          ? (base.audioBidireccional?.estado ?? 'desconocida')
          : lista.length === 0
            ? 'no'
            : util === null
              ? 'no'
              : 'si',
      canal: util?.id ?? null,
      formato: util?.formato ?? lista[0]?.formato ?? null,
    };
  }

  if (familia === 'terminal') {
    const acs = await pedir('leer si la terminal espera el veredicto de la plataforma');
    parciales.verificacionRemota = acs === null ? 'desconocida' : verificacionRemotaDesde(acs);
    const cap = await pedir('leer qué admite la biblioteca de rostros');
    const cuenta = await pedir('contar las plantillas de la biblioteca de rostros');
    const biblioteca = bibliotecaDesde(cap, cuenta);
    parciales.bibliotecaDeRostros = biblioteca;
    const personas = await pedir('capacidades de control de acceso de la terminal');
    parciales.gestionDePersonas = personas === null ? 'desconocida' : 'si';
    // La terminal también abre una puerta: la capacidad es la misma pregunta.
    const puerta = await pedir('leer qué órdenes admite la puerta desde la plataforma');
    if (puerta !== null) parciales.aperturaRemota = /open/i.test(puerta) ? 'si' : 'no';
  }

  if (familia === 'camara') {
    const barrera = await pedir('leer si este modelo reporta el estado de la barrera');
    parciales.estadoDeBarrera =
      barrera === null ? 'desconocida' : booleano(etiqueta(barrera, 'isSupportBarrierGateStatus'));
    // La cámara acciona la barrera por la ruta VERIFICADA: es apertura remota.
    parciales.aperturaRemota = 'si';
  }

  return capacidadesDescubiertas(parciales);
};

/**
 * La misma pregunta, desde los DATOS DE CONEXIÓN: es lo que usa la sonda de la
 * API al dar de alta un equipo. El cliente se construye aquí para que el
 * barril no tenga que exponerlo: fuera del paquete nadie habla el transporte.
 */
export const descubrirCapacidadesDe = async (
  opciones: OpcionesDeEquipo & {
    readonly familia: RutaDeEquipo['familia'];
    readonly dispositivoId?: string;
    readonly canal?: number;
  },
): Promise<CapacidadesDeEquipo> =>
  descubrirCapacidades({
    cliente: new ClienteDeEquipo(opciones),
    familia: opciones.familia,
    ...(opciones.dispositivoId === undefined ? {} : { dispositivoId: opciones.dispositivoId }),
    ...(opciones.canal === undefined ? {} : { canal: opciones.canal }),
  });

/**
 * Como `descubrirCapacidades`, pero un equipo que no contesta a NADA devuelve
 * «sin consultar» en vez de lanzar. Es lo que usa el proveedor en caliente,
 * donde el error de red ya lo trata quien pidió la apertura.
 */
export const descubrirSinLanzar = async (
  opciones: OpcionesDeDescubrimiento,
): Promise<CapacidadesDeEquipo> => {
  try {
    return await descubrirCapacidades(opciones);
  } catch (error) {
    if (error instanceof EquipoInalcanzable) return CAPACIDADES_SIN_CONSULTAR;
    throw error;
  }
};
