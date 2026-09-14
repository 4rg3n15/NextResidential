import type { OpcionesDeBarrera } from './control-barrera';
import { ControlDeBarreraVehicular } from './control-barrera';

/**
 * Construye el adaptador real **desde el entorno, y dentro de este paquete**.
 *
 * Vive aquí y no en la API por dos motivos que apuntan al mismo sitio:
 *
 * 1. **KPI-11.** Si la API leyera la dirección del equipo y el número de canal
 *    para pasárselos al adaptador, tendría que nombrarlos. El vocabulario del
 *    fabricante se queda dentro del paquete, y la API solo pregunta «¿hay un
 *    control de barrera configurado?».
 * 2. **RN-21 y §2.7.1.** La credencial no aparece en el código, ni en la base
 *    en claro, ni en ningún informe: llega por entorno y no sale de aquí. El
 *    escaneo de secretos corre en el gancho de pre-commit.
 */
export const VARIABLES = {
  host: 'BARRERA_HOST',
  puerto: 'BARRERA_PUERTO',
  usuario: 'BARRERA_USUARIO',
  clave: 'BARRERA_CLAVE',
  tiempoLimite: 'BARRERA_TIEMPO_LIMITE_MS',
} as const;

const OBLIGATORIAS = [VARIABLES.host, VARIABLES.usuario, VARIABLES.clave] as const;

export class ConfiguracionDeBarreraIncompleta extends Error {
  constructor(readonly faltantes: readonly string[]) {
    super(`Falta configuración del control de barrera: ${faltantes.join(', ')}`);
    this.name = 'ConfiguracionDeBarreraIncompleta';
  }
}

const entero = (valor: string | undefined): number | undefined => {
  if (valor === undefined || valor.trim() === '') return undefined;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : undefined;
};

/**
 * `null` si no hay nada configurado — entonces manda el simulado y **el
 * arranque no se rompe**, que es la condición del encargo.
 *
 * **Pero una configuración a medias LANZA.** No es simetría rota: es la
 * diferencia entre «aquí no hay equipo» y «alguien quiso conectarlo y se
 * equivocó al escribir el nombre de una variable». En el segundo caso, seguir
 * con el simulado dejaría una consola que dice «abriendo» sin que nada se mueva
 * — exactamente la ambigüedad contra la que avisa el propio adaptador simulado,
 * y la que hace que un despliegue mal cableado llegue a producción.
 */
export const crearControlDeBarreraDesdeEntorno = (
  entorno: NodeJS.ProcessEnv = process.env,
  extras: Partial<OpcionesDeBarrera> = {},
): ControlDeBarreraVehicular | null => {
  const presentes = OBLIGATORIAS.filter((v) => (entorno[v] ?? '').trim() !== '');
  if (presentes.length === 0) return null;

  const faltantes = OBLIGATORIAS.filter((v) => (entorno[v] ?? '').trim() === '');
  if (faltantes.length > 0) throw new ConfiguracionDeBarreraIncompleta(faltantes);

  const puerto = entero(entorno[VARIABLES.puerto]);
  const tiempoLimiteMs = entero(entorno[VARIABLES.tiempoLimite]);

  return new ControlDeBarreraVehicular({
    host: entorno[VARIABLES.host]!.trim(),
    usuario: entorno[VARIABLES.usuario]!.trim(),
    clave: entorno[VARIABLES.clave]!,
    ...(puerto === undefined ? {} : { puerto }),
    ...(tiempoLimiteMs === undefined ? {} : { tiempoLimiteMs }),
    ...extras,
  });
};
