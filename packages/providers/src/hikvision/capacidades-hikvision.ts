import type { CapacidadesDeEquipo, EstadoDeCapacidad } from '../nucleo/capacidades';
import { CAPACIDADES_SIN_CONSULTAR, capacidadesDescubiertas } from '../nucleo/capacidades';
import { CredencialRechazada } from '../nucleo/errores';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import type { RutaDeEquipo } from '../equipo/catalogo-de-rutas';
import { bloques, etiqueta } from '../equipo/xml';
import { recortado, sinSecretos } from '../equipo/intercambio';
import type { Bitacora } from '@ncr/domain-core';
import { CARRIL_VERIFICADO_DE_LA_CAMARA } from '../camara/carril';
import { recuentoDeLaBiblioteca } from '../terminal/recuento-de-biblioteca';

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
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-05 · EL INTERRUPTOR SE LLAMA `remoteCheckDoorEnabled`
 *
 * La guía de la terminal, «Remote Verification in Arming Method»: el
 * interruptor principal de `AcsCfg` es **`remoteCheckDoorEnabled`** («The main
 * switch for remote verification»). Aquí se leía `AcsCfg.remoteCheck` —el
 * [SUPUESTO] S-35—, que es el nombre del campo del EVENTO, no de la
 * configuración: en sitio el documento no lo traía y la capacidad quedaba
 * «desconocida», y con `reporta_y_espera` eso bloqueaba toda apertura. Se lee
 * el de la guía primero y el supuesto después, por si algún firmware lo usa.
 */
export const CAMPOS_DE_VERIFICACION_REMOTA = ['remoteCheckDoorEnabled', 'remoteCheck'] as const;

export const verificacionRemotaDesde = (json: string): EstadoDeCapacidad => {
  try {
    const objeto: unknown = JSON.parse(json);
    if (typeof objeto !== 'object' || objeto === null) return 'desconocida';
    const raiz = objeto as Record<string, unknown>;
    const acs = (raiz['AcsCfg'] ?? raiz) as Record<string, unknown>;
    for (const campo of CAMPOS_DE_VERIFICACION_REMOTA) {
      const valor = acs[campo];
      if (valor === true) return 'si';
      if (valor === false) return 'no';
    }
    return 'desconocida';
  } catch {
    return 'desconocida';
  }
};

/**
 * H-SITIO-05 · la SEGUNDA lectura, de la guía: `isSupportRemoteCheck` en las
 * capacidades de control de acceso. Dice si el equipo PUEDE, no si está
 * activado: `false` es un «no» firme; `true` no basta para «sí» —hay que
 * activarlo en `AcsCfg`— y queda «desconocida», con el motivo en la bitácora.
 */
export const verificacionRemotaSoportada = (documento: string | null): boolean | null => {
  if (documento === null) return null;
  const m = /isSupportRemoteCheck["'\s]*[:>]\s*"?(true|false)/i.exec(documento);
  return m?.[1] === undefined ? null : m[1].toLowerCase() === 'true';
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
  // Anexo 15-K · `recordDataNumber` de la biblioteca, como la guía («Face
  // Picture Search»); `totalNum` es la forma anterior, que se sigue leyendo.
  const almacenadas = recuentoDeLaBiblioteca(recuentoJson);
  return {
    estado: capacidadesJson === null && recuentoJson === null ? 'desconocida' : 'si',
    maximo,
    almacenadas,
  };
};

export interface OpcionesDeDescubrimiento {
  readonly cliente: ClienteDeEquipo;
  /** H-SITIO-05 · qué ruta se consultó y qué respondió, a la bitácora. */
  readonly traza?: Bitacora;
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
  /**
   * H-SITIO-09 · además del cuerpo, si el equipo dijo «no admito esto». Es lo
   * que separa `no` (NO APLICA) de `desconocida` (no se pudo leer): un
   * videoportero sin biblioteca de rostros no es un videoportero sin sondear.
   */
  const consultar = async (
    proposito: string,
    fam = familia,
  ): Promise<{ readonly cuerpo: string | null; readonly noAdmite: boolean }> => {
    let ruta: RutaDeEquipo;
    try {
      ruta = rutaPara(proposito, fam, opciones.canal ?? CARRIL_VERIFICADO_DE_LA_CAMARA);
    } catch {
      return { cuerpo: null, noAdmite: false };
    }
    // H-SITIO-15 · con el cuerpo que la ruta declara: nunca un POST vacío.
    const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta, ruta.cuerpo);
    // H-SITIO-05 · qué se preguntó y qué contestó, para comparar con la guía.
    opciones.traza?.registrar('info', 'capacidad consultada al equipo', {
      ...(opciones.dispositivoId === undefined ? {} : { dispositivoId: opciones.dispositivoId }),
      proposito,
      metodo: ruta.metodo,
      ruta: ruta.ruta,
      estadoHttp: respuesta.estado,
      respuesta: recortado(sinSecretos(respuesta.cuerpo), 1024),
    });
    // Una credencial rechazada NO es «no declara»: es un error propio, se
    // lanza y NO se reintenta (bloquea la cuenta del equipo). H-SITIO-12 · un
    // 403 con código ISAPI en el cuerpo es «no admite», no la clave.
    if (
      respuesta.estado === 401 ||
      (respuesta.estado === 403 && !/statusCode|subStatusCode/i.test(respuesta.cuerpo))
    ) {
      throw new CredencialRechazada(opciones.dispositivoId ?? cliente.destino);
    }
    if (respuesta.estado === 404 || rechazado(respuesta.cuerpo)) {
      return { cuerpo: null, noAdmite: true };
    }
    if (!respuesta.ok) return { cuerpo: null, noAdmite: false };
    return { cuerpo: respuesta.cuerpo, noAdmite: false };
  };
  const pedir = async (proposito: string, fam = familia): Promise<string | null> =>
    (await consultar(proposito, fam)).cuerpo;

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
    const personas = await pedir('capacidades de control de acceso de la terminal');
    const leida = acs === null ? 'desconocida' : verificacionRemotaDesde(acs);
    // H-SITIO-05 · segunda lectura, la de la guía: si el equipo ni la admite,
    // es un «no» firme; si la admite, sigue sin saberse si está activada.
    const soportada = verificacionRemotaSoportada(personas);
    parciales.verificacionRemota = leida === 'desconocida' && soportada === false ? 'no' : leida;
    if (leida === 'desconocida') {
      opciones.traza?.registrar('aviso', 'verificación remota sin leer en AcsCfg', {
        ...(opciones.dispositivoId === undefined ? {} : { dispositivoId: opciones.dispositivoId }),
        camposBuscados: [...CAMPOS_DE_VERIFICACION_REMOTA],
        isSupportRemoteCheck: soportada,
        consecuencia:
          soportada === false
            ? 'el equipo no la admite: en reporta_y_espera no se opera'
            : 'no se sabe si está activada: en reporta_y_espera no se opera hasta saberlo',
      });
    }
    const cap = await pedir('leer qué admite la biblioteca de rostros');
    const cuenta = await pedir('contar las plantillas de la biblioteca de rostros');
    const biblioteca = bibliotecaDesde(cap, cuenta);
    parciales.bibliotecaDeRostros = biblioteca;
    parciales.gestionDePersonas = personas === null ? 'desconocida' : 'si';
    // La terminal también abre una puerta: la capacidad es la misma pregunta.
    const puerta = await pedir('leer qué órdenes admite la puerta desde la plataforma');
    if (puerta !== null) parciales.aperturaRemota = /open/i.test(puerta) ? 'si' : 'no';
  }

  if (familia === 'videoportero') {
    /**
     * H-SITIO-09 · ¿tiene el videoportero biblioteca de rostros? En sitio
     * quedaba «desconocida» porque ni se preguntaba, y la sincronización total
     * lo saltaba sin decirlo. Se pregunta por las MISMAS rutas de la guía de
     * control de acceso que la terminal: si contesta, recibe las plantillas;
     * si dice «no admito», la ficha dice NO APLICA; si no se pudo leer, sigue
     * desconocida y no se le envía nada.
     */
    const cap = await consultar('leer qué admite la biblioteca de rostros', 'terminal');
    const cuenta = await consultar('contar las plantillas de la biblioteca de rostros', 'terminal');
    if (cap.cuerpo !== null || cuenta.cuerpo !== null) {
      parciales.bibliotecaDeRostros = bibliotecaDesde(cap.cuerpo, cuenta.cuerpo);
    } else if (cap.noAdmite && cuenta.noAdmite) {
      parciales.bibliotecaDeRostros = { estado: 'no', maximo: null, almacenadas: null };
    }
    const personas = await consultar('capacidades de control de acceso de la terminal', 'terminal');
    parciales.gestionDePersonas =
      personas.cuerpo !== null ? 'si' : personas.noAdmite ? 'no' : 'desconocida';
  }

  if (familia === 'camara') {
    const barrera = await pedir('leer si este modelo reporta el estado de la barrera');
    parciales.estadoDeBarrera =
      barrera === null ? 'desconocida' : booleano(etiqueta(barrera, 'isSupportBarrierGateStatus'));
    // La cámara acciona la barrera por la ruta VERIFICADA: es apertura remota,
    // y la misma ruta admite `lock`/`unlock` (H-3): es bloqueo de acceso.
    parciales.aperturaRemota = 'si';
    parciales.bloqueoDeAcceso = 'si';
  } else {
    // Terminal y videoportero abren por orden y no dejan el acceso bloqueado
    // como estado: lo declaran, para que la consola no ofrezca lo que no hay.
    parciales.bloqueoDeAcceso = 'no';
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
