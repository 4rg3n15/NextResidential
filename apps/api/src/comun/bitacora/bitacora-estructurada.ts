import type { Bitacora, NivelBitacora } from '@ncr/domain-core';

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

export class BitacoraEstructurada implements Bitacora {
  constructor(
    private readonly escribir: (linea: string) => void = (l) => process.stdout.write(`${l}\n`),
  ) {}

  registrar(
    nivel: NivelBitacora,
    mensaje: string,
    contexto?: Readonly<Record<string, unknown>>,
  ): void {
    this.escribir(
      JSON.stringify({
        nivel,
        mensaje,
        momento: new Date().toISOString(),
        ...(contexto ? { contexto: redactar(contexto) } : {}),
      }),
    );
  }
}
