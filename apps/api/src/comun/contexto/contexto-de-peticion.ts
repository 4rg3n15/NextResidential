import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { INestApplication } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CORRELACIÓN DE PETICIÓN EN **TODA** LÍNEA DE REGISTRO
 *
 * Qué faltaba. Desde la ETAPA 02 el identificador de correlación existía y
 * viajaba en la cabecera `x-request-id`, de ida y de vuelta. Lo que NO ocurría
 * es lo único para lo que sirve: **que las líneas de log lo lleven**. Un
 * usuario reportaba un fallo con su `x-request-id` en la mano y no había forma
 * de filtrar el registro por él, porque ninguna línea lo contenía. El alcance
 * de la ETAPA 14 pide «logs estructurados con correlación de petición» y hasta
 * aquí había correlación y había logs estructurados, separados.
 *
 * POR QUÉ `AsyncLocalStorage` Y NO UN PARÁMETRO. La alternativa honesta es
 * pasar el identificador por la firma de cada método hasta el último
 * repositorio. No se hace por una razón de arquitectura, no de comodidad: el
 * dominio no puede llevar un parámetro de transporte en sus firmas, y la
 * aplicación tampoco debería. `AsyncLocalStorage` es la primitiva de Node para
 * exactamente esto, y propaga a través de `await`, de `Promise.all` y de los
 * manejadores de eventos sin que nadie tenga que acordarse.
 *
 * POR QUÉ MIDDLEWARE DE EXPRESS Y NO UN INTERCEPTOR DE NEST. Un interceptor
 * recibe un `Observable` y el trabajo real ocurre cuando alguien se suscribe,
 * **fuera** del `run()`: el contexto se perdería para la mitad del manejador,
 * que es la peor forma de fallar —funciona en la prueba corta y no en la ruta
 * que importa—. El middleware envuelve `next()`, y todo lo que sigue —Nest
 * incluido— corre dentro.
 *
 * QUÉ IDENTIFICADOR SE USA. El de la cabecera entrante si viene, para que una
 * traza atraviese la consola, la API y el Edge con el mismo número; si no,
 * uno nuevo. **El de fuera se SANEA**: es entrada de red, va a parar a los
 * registros, y un valor con saltos de línea partiría una línea de log en dos
 * —inyección de registro— o crecería sin medida.
 */
export interface ContextoDePeticion {
  readonly correlacion: string;
  readonly ruta?: string;
  readonly metodo?: string;
}

const almacen = new AsyncLocalStorage<ContextoDePeticion>();

export const contextoActual = (): ContextoDePeticion | undefined => almacen.getStore();

export const correlacionActual = (): string | undefined => almacen.getStore()?.correlacion;

/** Para las pruebas y para cualquier trabajo de fondo que quiera su propia traza. */
export const conContexto = <T>(contexto: ContextoDePeticion, fn: () => T): T =>
  almacen.run(contexto, fn);

const LONGITUD_MAXIMA = 128;

/**
 * Un identificador de correlación es una etiqueta, no texto libre. Se admiten
 * letras, dígitos, guion, guion bajo y punto; cualquier otra cosa se descarta
 * entera y se genera uno propio. Truncar en vez de descartar dejaría pasar un
 * prefijo elegido por quien llama, que es la mitad del problema.
 */
export const correlacionAdmisible = (crudo: unknown): string | null => {
  if (typeof crudo !== 'string') return null;
  const valor = crudo.trim();
  if (valor.length === 0 || valor.length > LONGITUD_MAXIMA) return null;
  return /^[A-Za-z0-9._-]+$/.test(valor) ? valor : null;
};

export const aplicarContextoDePeticion = (app: INestApplication, nuevoId: () => string): void => {
  app.use((peticion: Request, respuesta: Response, siguiente: NextFunction) => {
    const correlacion = correlacionAdmisible(peticion.headers['x-request-id']) ?? nuevoId();
    peticion.headers['x-request-id'] = correlacion;
    respuesta.setHeader('x-request-id', correlacion);
    almacen.run({ correlacion, ruta: peticion.originalUrl, metodo: peticion.method }, () => {
      siguiente();
    });
  });
};
