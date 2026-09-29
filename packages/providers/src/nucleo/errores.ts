import type { NombreDeCapacidad } from './capacidades';

/**
 * LOS ERRORES QUE CRUZAN LA FRONTERA DEL PAQUETE, EN LENGUAJE NEUTRO.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ SON CLASES Y NO CADENAS
 *
 * Quien está fuera —la capa de aplicación de la API, la consola— tiene que
 * poder preguntar `instanceof` y reaccionar distinto: un equipo ocupado se
 * reintenta con espera y es `FALLO_TECNICO`; una credencial rechazada **no se
 * reintenta nunca**, porque estos aparatos bloquean la cuenta; una capacidad
 * ausente se enseña como «este equipo no puede» y no como avería.
 *
 * Hasta la 15-C esas reacciones vivían en `ReaccionAlError`, que es un valor
 * de retorno de `interpretarError` y sólo lo veían los adaptadores. Las clases
 * de aquí son la misma taxonomía **lanzada**, para que cualquier adaptador
 * —de esta marca o de otra— falle de la misma forma y la suite de contrato
 * pueda exigirlo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NINGUNA LLEVA EL CÓDIGO DEL FABRICANTE EN EL NOMBRE
 *
 * `EquipoOcupado` y no `DeviceBusy0x20000004`. El código, cuando lo hay, viaja
 * en `detalle` para poder buscarlo en la guía; la clase es lo que decide la
 * reacción, y la reacción no depende de la marca.
 */

/** Base común: todos llevan el dispositivo al que se le pidió algo. */
export class ErrorDeEquipo extends Error {
  constructor(
    readonly dispositivoId: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/**
 * Se le pidió al equipo algo que **no puede hacer**, o que nadie comprobó que
 * pueda. Se distingue de una avería: no hay nada que reintentar, y la salida es
 * o configurar el aparato, o aceptar que ese equipo no ofrece esa función.
 */
export class CapacidadNoSoportada extends ErrorDeEquipo {
  constructor(
    dispositivoId: string,
    readonly capacidad: NombreDeCapacidad,
    /** `true` cuando se niega por `desconocida`, no por `no`. Se dice. */
    readonly porDesconocida: boolean,
  ) {
    super(
      dispositivoId,
      porDesconocida
        ? `El equipo ${dispositivoId} no ha declarado si soporta «${capacidad}» y no se ` +
            'supone que sí: descubra sus capacidades desde la consola antes de operar'
        : `El equipo ${dispositivoId} no soporta «${capacidad}»`,
    );
  }
}

/**
 * D2 (15-L) · el equipo entrega un video que el navegador no reproduce (H.265
 * en el canal de la ficha, según su propia respuesta RTSP). Se niega ANTES de
 * negociar: un reproductor negro con «primer cuadro pendiente» no explica nada.
 */
export class VideoNoReproducible extends ErrorDeEquipo {
  constructor(
    dispositivoId: string,
    readonly codec: string,
    readonly canal: string,
  ) {
    // Sin el identificador: esta frase la lee el operador en la consola de video.
    super(
      dispositivoId,
      `Este equipo entrega ${codec} en el canal ${canal} y el navegador no lo reproduce: ` +
        'cámbielo a H.264 en el equipo o elija otro canal en su ficha',
    );
  }
}

/** Ocupado ahora. Reintentable con espera. Es FALLO_TECNICO, no denegación. */
export class EquipoOcupado extends ErrorDeEquipo {
  readonly reintentable = true;
  constructor(dispositivoId: string, detalle: string) {
    super(dispositivoId, `El equipo ${dispositivoId} está ocupado: ${detalle}`);
  }
}

/** Avería propia del equipo. Reintentar no lo arregla. */
export class EquipoAveriado extends ErrorDeEquipo {
  readonly reintentable = false;
  constructor(
    dispositivoId: string,
    detalle: string,
    /** 15-L · la traducción del código del fabricante, sin jerga, para la consola. */
    readonly legible?: string,
  ) {
    super(dispositivoId, `El equipo ${dispositivoId} informa de un error propio: ${detalle}`);
  }
}

/** El cambio pedido exige reiniciar el aparato. Lo hace una persona. */
export class ReinicioNecesario extends ErrorDeEquipo {
  constructor(dispositivoId: string, detalle: string) {
    super(
      dispositivoId,
      `El equipo ${dispositivoId} exige reinicio para que el cambio surta efecto: ${detalle}`,
    );
  }
}

/**
 * Credencial rechazada. **Nunca se reintenta en bucle**: el aparato bloquea
 * la cuenta de servicio tras unos pocos intentos y hay que ir a desbloquearla.
 */
export interface BloqueoDeclarado {
  /** Segundos hasta el desbloqueo, si el equipo los dijo. */
  readonly segundosParaDesbloquear: number | null;
}

export class CredencialRechazada extends ErrorDeEquipo {
  readonly reintentable = false;
  constructor(
    dispositivoId: string,
    /**
     * A5 (15-L) · cuánto hace que el equipo la rechazó, cuando esta vez NI SE
     * PRESENTÓ: la plataforma ya sabía que no vale. `undefined` = la rechazó
     * el equipo ahora.
     */
    readonly rechazadaHaceMs?: number,
    /**
     * E1-f (15-M) · el equipo dijo en el cuerpo que la cuenta está BLOQUEADA
     * (`lockStatus`/`unlockTime`): no es una clave mal escrita, es un bloqueo
     * que vence solo. `null` = no declaró bloqueo.
     */
    readonly bloqueo: BloqueoDeclarado | null = null,
  ) {
    super(dispositivoId, CredencialRechazada.texto(dispositivoId, rechazadaHaceMs, bloqueo));
  }

  private static texto(
    dispositivoId: string,
    hace: number | undefined,
    bloqueo: BloqueoDeclarado | null,
  ): string {
    const tiempo =
      bloqueo === null
        ? ''
        : bloqueo.segundosParaDesbloquear === null
          ? ' (el equipo declara la cuenta BLOQUEADA)'
          : ` (el equipo declara la cuenta BLOQUEADA: se desbloquea en ${String(bloqueo.segundosParaDesbloquear)} s)`;
    if (hace === undefined || hace < 60_000) {
      return (
        `El equipo ${dispositivoId} acaba de rechazar el usuario o la clave${tiempo}. NO se ` +
        'reintenta: estos aparatos bloquean la cuenta tras unos pocos intentos fallidos'
      );
    }
    return (
      `Credencial rechazada por el equipo ${dispositivoId} hace ` +
      `${String(Math.round(hace / 60_000))} min${tiempo}: no se vuelve a presentar hasta que se ` +
      'corrija en la consola o se pulse «Probar conexión», para que el equipo no bloquee esta dirección'
    );
  }
}

/**
 * E1-b (15-M) · el equipo contestó `401` a una petición SIN credencial y SIN
 * `WWW-Authenticate`: no hay con qué autenticarse, y NO es la clave —nunca se
 * presentó—. Se reintenta más tarde, como un fallo pasajero del equipo.
 */
export class SinDesafioDigest extends ErrorDeEquipo {
  readonly reintentable = true;
  constructor(dispositivoId: string) {
    super(
      dispositivoId,
      `El equipo ${dispositivoId} contestó 401 sin ofrecer un desafío Digest: no se pudo ` +
        'autenticar y no es la clave (no se presentó). Reintente en unos segundos',
    );
  }
}

/**
 * H-SITIO-12 · el equipo aceptó el resumen Digest pero venció el nonce dos veces
 * seguidas (`stale=true`). **No es la clave**: reintentar la orden es seguro,
 * porque el resumen era correcto y el equipo no lo cuenta como intento fallido.
 * En sitio, confundirlo con `CredencialRechazada` hizo que la segunda orden de
 * cada equipo se anunciara como «usuario o clave».
 */
export class DesafioVencido extends ErrorDeEquipo {
  readonly reintentable = true;
  constructor(dispositivoId: string) {
    super(
      dispositivoId,
      `El equipo ${dispositivoId} venció el desafío de acceso dos veces seguidas: no es la clave. ` +
        'Reintente la orden',
    );
  }
}

/** La biblioteca de rostros está llena: una plantilla más no cabe. */
export class BibliotecaLlena extends ErrorDeEquipo {
  constructor(
    dispositivoId: string,
    readonly maximo: number | null,
  ) {
    super(
      dispositivoId,
      maximo === null
        ? `La biblioteca de rostros del equipo ${dispositivoId} está llena`
        : `La biblioteca de rostros del equipo ${dispositivoId} está llena (${String(maximo)} plantillas)`,
    );
  }
}

/** Se le mandó algo mal formado. El defecto es nuestro; no se reintenta. */
export class PeticionRechazada extends ErrorDeEquipo {
  readonly reintentable = false;
  constructor(
    dispositivoId: string,
    detalle: string,
    /** 15-L · la traducción del código del fabricante, sin jerga, para la consola. */
    readonly legible?: string,
  ) {
    super(dispositivoId, `El equipo ${dispositivoId} rechazó la petición: ${detalle}`);
  }
}

/**
 * Anexo 15-K · el equipo contestó `200` a una ESCRITURA sin confirmarla:
 * sin `statusCode` y `subStatusCode`, o con un `statusCode` distinto de 1. En
 * sitio, un «OK» sin espacio de nombres fue un «OK» y la puerta no se movió;
 * una respuesta que ni siquiera dice «1» no se cuenta como aceptada.
 */
export class OrdenSinConfirmar extends ErrorDeEquipo {
  readonly reintentable = false;
  constructor(dispositivoId: string, detalle: string) {
    super(
      dispositivoId,
      `El equipo ${dispositivoId} no confirmó la orden (se exige statusCode 1 con su ` +
        `subStatusCode): ${detalle}`,
    );
  }
}
