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
  constructor(dispositivoId: string, detalle: string) {
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
export class CredencialRechazada extends ErrorDeEquipo {
  readonly reintentable = false;
  constructor(dispositivoId: string) {
    super(
      dispositivoId,
      `El equipo ${dispositivoId} rechazó el usuario o la clave. NO se reintenta: estos ` +
        'aparatos bloquean la cuenta tras unos pocos intentos fallidos',
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
  constructor(dispositivoId: string, detalle: string) {
    super(dispositivoId, `El equipo ${dispositivoId} rechazó la petición: ${detalle}`);
  }
}
