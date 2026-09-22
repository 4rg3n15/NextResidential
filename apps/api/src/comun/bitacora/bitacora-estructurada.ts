import type { Bitacora, NivelBitacora } from '@ncr/domain-core';
import { contextoActual } from '../contexto/contexto-de-peticion';

/**
 * Bitácora estructurada con REDACCIÓN (§2.7.8: contraseñas y tokens jamás en
 * logs). La redacción se hace aquí, en el único punto por el que sale todo, y
 * no en cada llamada: confiar en que quien registra se acuerde de omitir la
 * llave es exactamente cómo acaba una llave en un log.
 */
const CLAVES_SENSIBLES = [
  'password',
  'contrasena',
  'contraseña',
  'secret',
  'secreto',
  'token',
  'jwt',
  'authorization',
  'apikey',
  'api_key',
  'llave',
  'key',
  'cookie',
  'plantilla',
  'refresh_token',
  'access_token',
  'placa',
  'documento',
  'numero_documento',
  'correo',
];

const REDACTADO = '[REDACTADO]';
const PROFUNDIDAD_MAXIMA = 6;

const esSensible = (clave: string): boolean => {
  const k = clave.toLowerCase();
  return CLAVES_SENSIBLES.some((s) => k.includes(s));
};

export const redactar = (valor: unknown, profundidad = 0): unknown => {
  if (profundidad > PROFUNDIDAD_MAXIMA) return '[PROFUNDIDAD_MAXIMA]';
  if (valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  if (valor instanceof Date) return valor.toISOString();

  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[k] = esSensible(k) ? REDACTADO : redactar(v, profundidad + 1);
  }
  return salida;
};

/**
 * Orden de severidad. `LOG_LEVEL` fija el mínimo que se emite: con `info`, un
 * `debug` no se escribe. Es lo que permite dejar trazas finas en el código sin
 * inundar producción, y es la mitad que le faltaba a `LOG_LEVEL` —estaba en
 * `.env.example` desde la ETAPA 02 y **nadie la leía** (deuda de la ETAPA 14)—.
 */
export const SEVERIDAD: Readonly<Record<NivelBitacora, number>> = {
  debug: 10,
  info: 20,
  aviso: 30,
  error: 40,
};

export class BitacoraEstructurada implements Bitacora {
  constructor(
    private readonly escribir: (linea: string) => void = (l) => process.stdout.write(`${l}\n`),
    private readonly nivelMinimo: NivelBitacora = 'debug',
  ) {}

  registrar(
    nivel: NivelBitacora,
    mensaje: string,
    contexto?: Readonly<Record<string, unknown>>,
  ): void {
    if (SEVERIDAD[nivel] < SEVERIDAD[this.nivelMinimo]) return;
    /**
     * La correlación se toma del contexto de la petición en curso, no de un
     * parámetro. Así la lleva TODA línea —incluidas las que escribe un
     * repositorio tres capas más abajo, que no sabe nada de HTTP— y un
     * `x-request-id` reportado por un usuario filtra el registro entero.
     * Fuera de una petición —arranque, trabajo programado— simplemente no
     * está, y su ausencia es información: esa línea no la provocó nadie.
     */
    const contextoDePeticion = contextoActual();
    this.escribir(
      JSON.stringify({
        nivel,
        mensaje,
        momento: new Date().toISOString(),
        ...(contextoDePeticion === undefined
          ? {}
          : {
              correlacion: contextoDePeticion.correlacion,
              ...(contextoDePeticion.metodo === undefined
                ? {}
                : {
                    peticion:
                      `${contextoDePeticion.metodo} ${contextoDePeticion.ruta ?? ''}`.trim(),
                  }),
            }),
        ...(contexto ? { contexto: redactar(contexto) } : {}),
      }),
    );
  }
}
