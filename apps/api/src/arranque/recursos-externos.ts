import type { Bitacora } from '@ncr/domain-core';

/**
 * Comprobación de recursos externos al arrancar.
 *
 * **Por qué existe.** Nueve etapas, diecinueve pasos de verificación y más de
 * mil pruebas en verde convivieron con una API que no dejaba entrar a nadie: la
 * URL del JWKS estaba mal y nada lo dijo hasta que un usuario intentó
 * autenticarse. El patrón está registrado como DT-12 —«la API prueba su puerto
 * contra un doble, la base prueba sus filas, y nadie toca el recurso real»— y
 * la única forma de cerrarlo es que **el proceso hable con el recurso de
 * verdad**, y lo haga al levantar, no en la primera petición del usuario.
 *
 * **Qué NO hace: tumbar el proceso.** La configuración incompleta sí impide
 * arrancar (§2.7.1, y eso ocurre antes, en el esquema Zod). Un recurso externo
 * caído es otra cosa: es una dependencia que volverá, y matar el proceso por
 * ella produce reinicios en cadena cuando la plataforma parpadea. La distinción
 * que este código respeta es la misma que separa `/health` de `/ready`: el
 * proceso vive, y si le falta el JWKS `/ready` lo saca del balanceador. Lo que
 * cambia es que ahora **lo dice al arrancar, con nombre y con remedio**.
 */

export type EstadoDeRecurso = 'ok' | 'roto' | 'sin-configurar';

export interface ResultadoDeRecurso {
  readonly estado: EstadoDeRecurso;
  /** Qué se observó. Nunca lleva secretos ni la URL con el `project-ref`. */
  readonly detalle: string;
  /** Qué hacer. Un aviso sin remedio obliga a adivinar y se acaba ignorando. */
  readonly remedio?: string;
}

export interface RecursoExterno {
  readonly nombre: string;
  /** `true` si el sistema no puede operar sin él. Decide el nivel del aviso. */
  readonly critico: boolean;
  comprobar(): Promise<ResultadoDeRecurso>;
}

export interface InformeDeRecursos {
  readonly recursos: ReadonlyArray<{ readonly nombre: string } & ResultadoDeRecurso>;
  /** `true` si algún recurso crítico está roto. */
  readonly hayCriticoRoto: boolean;
}

/**
 * Comprueba todos los recursos y lo deja escrito. Devuelve el informe para que
 * quien llame decida —las pruebas lo afirman, `main.ts` solo lo registra—.
 *
 * Se comprueban en paralelo y con un límite de tiempo por recurso: el arranque
 * no puede quedarse colgado porque un endpoint remoto no cierre la conexión.
 */
export const comprobarRecursosExternos = async (
  recursos: readonly RecursoExterno[],
  bitacora: Bitacora,
  limiteMs = 8000,
): Promise<InformeDeRecursos> => {
  const resultados = await Promise.all(
    recursos.map(async (recurso) => {
      const resultado = await conLimite(recurso.comprobar(), limiteMs, {
        estado: 'roto' as const,
        detalle: `la comprobación no respondió en ${limiteMs} ms`,
        remedio: 'comprueba la conectividad de salida del despliegue',
      });
      return { nombre: recurso.nombre, critico: recurso.critico, ...resultado };
    }),
  );

  for (const r of resultados) {
    if (r.estado === 'ok') {
      bitacora.registrar('info', `recurso externo OK: ${r.nombre}`, { detalle: r.detalle });
      continue;
    }
    // Un recurso crítico roto es un `error` aunque el proceso siga: es lo que
    // dispara la alerta. Uno no crítico, o sin configurar, es un `aviso`: hace
    // falta que conste, no que despierte a nadie.
    bitacora.registrar(
      r.critico && r.estado === 'roto' ? 'error' : 'aviso',
      `recurso externo ${r.estado.toUpperCase()}: ${r.nombre}`,
      {
        detalle: r.detalle,
        ...(r.remedio === undefined ? {} : { remedio: r.remedio }),
      },
    );
  }

  return {
    recursos: resultados.map(({ nombre, estado, detalle, remedio }) => ({
      nombre,
      estado,
      detalle,
      ...(remedio === undefined ? {} : { remedio }),
    })),
    hayCriticoRoto: resultados.some((r) => r.critico && r.estado === 'roto'),
  };
};

const conLimite = async <T>(promesa: Promise<T>, ms: number, alAgotarse: T): Promise<T> => {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<T>((resolver) => {
        temporizador = setTimeout(() => resolver(alAgotarse), ms);
      }),
    ]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
};
