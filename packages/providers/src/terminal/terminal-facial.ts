import type {
  AccessPointProvider,
  FaceTemplateProvider,
  ResultadoAccionamiento,
} from '@ncr/domain-core';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';

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
 * El modo NO se adivina: se declara. Un adaptador que lo dedujera de una
 * respuesta del equipo escondería la decisión arquitectónica más importante de
 * esta etapa dentro de una rama.
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
    await this.altaDePersona(plantillaId);

    const ruta = rutaPara('cargar la plantilla facial', 'terminal');
    const separador = `----ncr${String(plantilla.byteLength)}`;
    const descriptor = JSON.stringify({
      FaceDataRecord: {
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
   * poder demostrar que el dato ya no está. Lo que este método garantiza es que
   * se pidió y que el equipo no la rechazó; la comprobación de que desapareció
   * es del guion de puesta en marcha, que vuelve a preguntar por ella.
   */
  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    const ruta = rutaPara('suprimir la plantilla facial', 'terminal');
    const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
      tipo: 'application/json',
      contenido: JSON.stringify({
        FPID: [{ value: plantillaId }],
        FDID: this.opciones.bibliotecaId ?? '1',
      }),
    });
    this.exigir(respuesta, ruta.proposito, ruta.ruta, dispositivoId);

    // En `decide_el_equipo` esto NO es limpieza: es el único modo que tenemos
    // de revocar un acceso, y por eso la latencia de esta llamada es la ventana
    // durante la cual una autorización vencida seguía abriendo.
  }

  /** Apertura remota. El relé lo acciona la plataforma, no el reconocimiento. */
  async abrir(_dispositivoId: string, _actorId: string): Promise<ResultadoAccionamiento> {
    const ruta = rutaPara('abrir la puerta desde la plataforma', 'terminal');
    try {
      const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
        tipo: 'application/xml',
        contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
      });
      if (NO_SOPORTADO.test(respuesta.cuerpo)) throw new RutaNoSoportada(ruta.proposito, ruta.ruta);
      return { aceptado: respuesta.ok, latenciaMs: respuesta.latenciaMs };
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

  private async altaDePersona(plantillaId: string): Promise<void> {
    const ruta = rutaPara('dar de alta la persona a la que pertenece la plantilla', 'terminal');
    const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
      tipo: 'application/json',
      contenido: JSON.stringify({
        UserInfo: {
          employeeNo: plantillaId,
          // El nombre NO viaja: el equipo no es fuente de verdad y no hay
          // motivo para dejar datos personales en un aparato cuyo registro se
          // puede borrar por API. La identidad vive en `plantillas_biometricas`.
          name: plantillaId,
          userType: 'normal',
          Valid: { enable: false },
        },
      }),
    });
    // Un alta repetida no es un fallo: la sincronización tiene que poder
    // reintentarse sin que la segunda vez rompa.
    if (!respuesta.ok && !/exist|duplicat/i.test(respuesta.cuerpo)) {
      this.exigir(respuesta, ruta.proposito, ruta.ruta, plantillaId);
    }
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
    referencia: string,
  ): void {
    if (NO_SOPORTADO.test(respuesta.cuerpo) || respuesta.estado === 404) {
      throw new RutaNoSoportada(proposito, ruta);
    }
    if (!respuesta.ok) {
      throw new Error(
        `El equipo rechazó «${proposito}» para ${referencia} (HTTP ${String(respuesta.estado)})`,
      );
    }
  }
}
