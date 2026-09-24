import type {
  AccessPointProvider,
  FaceTemplateProvider,
  ResultadoAccionamiento,
} from '@ncr/domain-core';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { comoErrorNeutral } from '../equipo/errores-del-fabricante';
import { BibliotecaLlena } from '../nucleo/errores';

/**
 * TERMINAL FACIAL · `DS-K1T344MBFWX-E1` · V4.47.0 build 250722.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TODAS LAS RUTAS DE ESTE ADAPTADOR SON **DOCUMENTADAS, NO VERIFICADAS**
 *
 * Salen de la documentación ISAPI del fabricante, no de una captura de este
 * aparato. Están en `equipo/catalogo-de-rutas.ts` con su procedencia y con qué
 * comprobar en sitio para ascenderlas. Que una falle contra el equipo con
 * `notSupport` o `404` **está previsto**: la salida es capturar la buena y
 * cambiarla en el catálogo, nunca probar otra por parecido.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS DOS MODOS, Y POR QUÉ EL ADAPTADOR SOPORTA LOS DOS
 *
 * Hoy la terminal **abre por su cuenta**: lo confirmó el usuario. Eso contradice
 * el principio rector —«Next Control decide, el hardware ejecuta»— y hay que
 * cambiarlo, pero **si se puede cambiar no se sabe todavía**: depende de que el
 * firmware permita separar reconocer de accionar, y eso se comprueba delante
 * del equipo.
 *
 * | Modo                | Quién decide  | Qué gobernamos                     |
 * | ------------------- | ------------- | ---------------------------------- |
 * | `reporta_y_espera`  | Nuestro motor | Todo. Es el principio rector       |
 * | `decide_el_equipo`  | La terminal   | Sólo QUÉ plantillas están cargadas |
 *
 * En `decide_el_equipo` la autorización se ejerce **retirando la plantilla**:
 * una vigencia que vence se hace efectiva suprimiéndola, no negando un acceso.
 * Es más débil y hay que decirlo así: entre que la vigencia caduca y que la
 * supresión llega, el equipo abre. `latenciaDeRevocacionMs` mide esa ventana y
 * es la cifra que hace la diferencia visible en vez de teórica.
 *
 * El modo NO se adivina: se declara. Y desde la 15-D, **declararlo no basta**:
 * `reporta_y_espera` exige que el equipo tenga la verificación remota activa,
 * y eso lo comprueba el proveedor por capacidades antes de operar (D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE LA 15-D CAMBIA AQUÍ
 *
 * · `FDSetUp` va por **PUT** (D3): el catálogo decía POST.
 * · La puerta que abre se **declara** (`numeroDePuerta`), no es 1 (D4).
 * · Los rechazos del equipo salen como **errores neutrales** tipados.
 * · La supresión se **verifica**: se vuelve a preguntar por la plantilla y se
 *   cuenta la biblioteca. Un `OK` a la orden no demuestra que el dato no está.
 */

export type ModoDeTerminal = 'reporta_y_espera' | 'decide_el_equipo';

export interface OpcionesDeTerminal extends OpcionesDeEquipo {
  /**
   * Se declara, no se deduce. Por omisión el conservador: suponer que el equipo
   * espera cuando en realidad abre solo produciría un sistema que cree decidir
   * y no decide.
   */
  readonly modo: ModoDeTerminal;
  /** Biblioteca de rostros del equipo. Se confirma en sitio. */
  readonly bibliotecaId?: string;
  /** Qué puerta abre esta terminal. Declarada en el alta; sin ella no se abre. */
  readonly numeroDePuerta?: number | null;
  /** Máximo de plantillas que el equipo declara. `null` si no lo dijo. */
  readonly bibliotecaMaximo?: number | null;
}

/** Lo que el equipo contesta cuando la ruta no existe en ese firmware. */
const NO_SOPORTADO = /notSupport|invalidOperation|notSupported/i;

export class RutaNoSoportada extends Error {
  constructor(
    readonly proposito: string,
    readonly ruta: string,
  ) {
    super(
      `El equipo no soporta «${proposito}» en ${ruta}. La ruta estaba DOCUMENTADA y NO ` +
        'VERIFICADA: captúrela del equipo y corríjala en el catálogo, no pruebe otra por analogía',
    );
    this.name = 'RutaNoSoportada';
  }
}

export interface VerificacionDeSupresion {
  /** `true` si la búsqueda posterior ya no encuentra la plantilla. */
  readonly ausente: boolean | null;
  /** Recuento de la biblioteca después de suprimir. `null` si no contestó. */
  readonly enBiblioteca: number | null;
  readonly latenciaMs: number;
}

export class TerminalFacial implements FaceTemplateProvider, AccessPointProvider {
  private readonly cliente: ClienteDeEquipo;

  constructor(private readonly opciones: OpcionesDeTerminal) {
    this.cliente = new ClienteDeEquipo(opciones);
  }

  get modo(): ModoDeTerminal {
    return this.opciones.modo;
  }

  /**
   * Alta de plantilla. **Dos pasos y en este orden**: primero la persona,
   * después su rostro. Al revés, el equipo rechaza el rostro por no tener a
   * quién asignárselo, y el error que devuelve no lo dice.
   */
  async sincronizar(
    dispositivoId: string,
    plantillaId: string,
    plantilla: Uint8Array,
  ): Promise<void> {
    /**
     * ═════════════════════════════════════════════════════════════════════════
     * LO ENCONTRÓ LA SUITE DE CONTRATO · 15-C
     *
     * `MockProvider` rechazaba una plantilla vacía desde la ETAPA 05 y este
     * adaptador la aceptaba. No eran intercambiables, y la diferencia caía del
     * lado peor: contra el equipo real, una captura fallida que nadie comprobó
     * se subía igual y dejaba en la terminal **una plantilla que no reconoce a
     * nadie, nunca**. El síntoma en sitio es un residente al que la puerta no
     * le abre, con todo el sistema diciendo que su rostro está sincronizado.
     *
     * Es justo lo que la prueba de LSP existe para destapar, y el arreglo va en
     * el adaptador —aquí— y no en la aserción.
     */
    if (plantilla.length === 0) {
      throw new Error(
        `No se sincroniza una plantilla VACÍA para ${plantillaId}: es lo que llega cuando la ` +
          'captura falló y nadie lo comprobó, y dejaría en la terminal un rostro que no ' +
          'reconoce a nadie (RN-11)',
      );
    }

    // Antes de subir: ¿cabe? Preguntar cuesta una consulta; no preguntar deja
    // un rechazo del equipo que hay que interpretar después.
    const maximo = this.opciones.bibliotecaMaximo ?? null;
    if (maximo !== null) {
      const ahora = await this.contar();
      if (ahora !== null && ahora >= maximo) throw new BibliotecaLlena(dispositivoId, maximo);
    }

    await this.altaDePersona(dispositivoId, plantillaId);

    const ruta = rutaPara('cargar la plantilla facial', 'terminal');
    const separador = `----ncr${String(plantilla.byteLength)}`;
    const descriptor = JSON.stringify({
      FaceDataRecord: {
        faceLibType: 'blackFD',
        FDID: this.opciones.bibliotecaId ?? '1',
        FPID: plantillaId,
      },
    });

    const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
      tipo: `multipart/form-data; boundary=${separador}`,
      contenido: this.sobre(separador, descriptor, plantilla),
    });

    this.exigir(respuesta, ruta.proposito, ruta.ruta, dispositivoId);
  }

  /**
   * Supresión. **No se da por buena porque la orden se aceptara**: RN-11 exige
   * poder demostrar que el dato ya no está. Este método pide la supresión y,
   * si el equipo la acepta, **vuelve a preguntar** con `suprimirYVerificar`;
   * aquí se conserva la firma del puerto y se lanza si el equipo la rechazó.
   */
  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    await this.suprimirYVerificar(dispositivoId, plantillaId);
  }

  /**
   * La supresión CON su prueba: búsqueda posterior y recuento. Es lo que el
   * guion de puesta en marcha imprime como evidencia de RN-11 (CA-10, CA-11).
   *
   * En `decide_el_equipo` esto NO es limpieza: es el único modo que tenemos
   * de revocar un acceso, y por eso la latencia de esta llamada es la ventana
   * durante la cual una autorización vencida seguía abriendo.
   */
  async suprimirYVerificar(
    dispositivoId: string,
    plantillaId: string,
  ): Promise<VerificacionDeSupresion> {
    const ruta = rutaPara('suprimir la plantilla facial', 'terminal');
    const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
      tipo: 'application/json',
      contenido: JSON.stringify({
        FPID: [{ value: plantillaId }],
        FDID: this.opciones.bibliotecaId ?? '1',
      }),
    });
    this.exigir(respuesta, ruta.proposito, ruta.ruta, dispositivoId);

    const ausente = await this.existe(plantillaId);
    return {
      ausente: ausente === null ? null : !ausente,
      enBiblioteca: await this.contar(),
      latenciaMs: respuesta.latenciaMs,
    };
  }

  /** Cuántas plantillas hay en la biblioteca. `null` si el equipo no contesta. */
  async contar(): Promise<number | null> {
    const ruta = rutaPara('contar las plantillas de la biblioteca de rostros', 'terminal');
    try {
      const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
        tipo: 'application/json',
        contenido: JSON.stringify({ FDID: this.opciones.bibliotecaId ?? '1' }),
      });
      if (!respuesta.ok || NO_SOPORTADO.test(respuesta.cuerpo)) return null;
      const n = /"totalNum"\s*:\s*(\d+)/.exec(respuesta.cuerpo)?.[1];
      return n === undefined ? null : Number(n);
    } catch (error) {
      if (error instanceof EquipoInalcanzable) return null;
      throw error;
    }
  }

  /** ¿Está la plantilla en la biblioteca? `null` si no se pudo preguntar. */
  async existe(plantillaId: string): Promise<boolean | null> {
    const ruta = rutaPara('buscar una plantilla en la biblioteca de rostros', 'terminal');
    try {
      const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
        tipo: 'application/json',
        contenido: JSON.stringify({
          searchResultPosition: 0,
          maxResults: 1,
          FDID: this.opciones.bibliotecaId ?? '1',
          FPID: plantillaId,
        }),
      });
      if (!respuesta.ok || NO_SOPORTADO.test(respuesta.cuerpo)) return null;
      const n = /"(?:numOfMatches|totalMatches)"\s*:\s*(\d+)/.exec(respuesta.cuerpo)?.[1];
      return n === undefined ? null : Number(n) > 0;
    } catch (error) {
      if (error instanceof EquipoInalcanzable) return null;
      throw error;
    }
  }

  /** Apertura remota. El relé lo acciona la plataforma, no el reconocimiento. */
  async abrir(dispositivoId: string, _actorId: string): Promise<ResultadoAccionamiento> {
    const ruta = rutaPara(
      'abrir la puerta desde la plataforma',
      'terminal',
      this.opciones.numeroDePuerta ?? undefined,
    );
    try {
      const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
        tipo: 'application/xml',
        contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
      });
      if (NO_SOPORTADO.test(respuesta.cuerpo)) throw new RutaNoSoportada(ruta.proposito, ruta.ruta);
      if (!respuesta.ok) throw comoErrorNeutral(dispositivoId, respuesta.cuerpo, respuesta.estado);
      return { aceptado: true, latenciaMs: respuesta.latenciaMs };
    } catch (error) {
      if (error instanceof EquipoInalcanzable) {
        return { aceptado: false, latenciaMs: error.latenciaMs };
      }
      throw error;
    }
  }

  async estado(_dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'> {
    const ruta = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'terminal');
    try {
      const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta);
      // Contesta pero rechaza: está vivo y mal configurado. `degradado` lo
      // separa de «no contesta», que se resuelve llamando al técnico.
      if (respuesta.estado === 401) return 'degradado';
      return respuesta.ok ? 'en_linea' : 'degradado';
    } catch {
      return 'fuera_de_linea';
    }
  }

  /**
   * Alta de la persona. Si ya existe, se **modifica** en vez de fallar: la
   * sincronización tiene que poder reintentarse sin que la segunda vez rompa.
   */
  private async altaDePersona(dispositivoId: string, plantillaId: string): Promise<void> {
    const ruta = rutaPara('dar de alta la persona a la que pertenece la plantilla', 'terminal');
    const persona = JSON.stringify({
      UserInfo: {
        employeeNo: plantillaId,
        // El nombre NO viaja: el equipo no es fuente de verdad y no hay
        // motivo para dejar datos personales en un aparato cuyo registro se
        // puede borrar por API. La identidad vive en `plantillas_biometricas`.
        name: plantillaId,
        userType: 'normal',
        Valid: { enable: false },
      },
    });
    const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
      tipo: 'application/json',
      contenido: persona,
    });
    if (respuesta.ok) return;
    if (/exist|duplicat/i.test(respuesta.cuerpo)) {
      const modificar = rutaPara(
        'modificar la persona a la que pertenece la plantilla',
        'terminal',
      );
      const segunda = await this.cliente.pedir(modificar.metodo, modificar.ruta, {
        tipo: 'application/json',
        contenido: persona,
      });
      this.exigir(segunda, modificar.proposito, modificar.ruta, dispositivoId);
      return;
    }
    this.exigir(respuesta, ruta.proposito, ruta.ruta, dispositivoId);
  }

  private sobre(separador: string, descriptor: string, imagen: Uint8Array): Uint8Array {
    const cabecera = Buffer.from(
      `--${separador}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\n` +
        `Content-Type: application/json\r\n\r\n${descriptor}\r\n` +
        `--${separador}\r\nContent-Disposition: form-data; name="FaceImage"\r\n` +
        'Content-Type: image/jpeg\r\n\r\n',
    );
    return Buffer.concat([cabecera, Buffer.from(imagen), Buffer.from(`\r\n--${separador}--\r\n`)]);
  }

  private exigir(
    respuesta: { ok: boolean; cuerpo: string; estado: number },
    proposito: string,
    ruta: string,
    dispositivoId: string,
  ): void {
    if (NO_SOPORTADO.test(respuesta.cuerpo) || respuesta.estado === 404) {
      throw new RutaNoSoportada(proposito, ruta);
    }
    // Un `200` con código de estado de error dentro también es un rechazo: así
    // contestan estos equipos cuando exigen reinicio.
    const codigo = /<statusCode>\s*(\d+)\s*<\/statusCode>/i.exec(respuesta.cuerpo)?.[1];
    if (!respuesta.ok || (codigo !== undefined && codigo !== '0' && codigo !== '1')) {
      throw comoErrorNeutral(dispositivoId, respuesta.cuerpo, respuesta.estado);
    }
  }
}
