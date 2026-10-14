/**
 * 15-Y1 · lo que la consola lee de las respuestas de `POST /auth/registro`,
 * con las mismas reglas que la app (`cuerpo_de_error.dart`): la política
 * adjunta al rechazo, los campos rechazados y la espera de un 429.
 */
export interface PoliticaDeDatos {
  readonly version: string;
  readonly texto: string;
}

const carga = (cuerpo: unknown): Record<string, unknown> | null => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  const interno = c['mensaje'];
  return typeof interno === 'object' && interno !== null ? (interno as Record<string, unknown>) : c;
};

/** La política, donde la API la pone: dentro de `mensaje` (filtro global) o arriba. */
export const politicaDelRechazo = (cuerpo: unknown): PoliticaDeDatos | null => {
  const interno = carga(cuerpo);
  const arriba =
    typeof cuerpo === 'object' && cuerpo !== null
      ? (cuerpo as Record<string, unknown>)['politica']
      : undefined;
  const politica = interno?.['politica'] ?? arriba;
  if (typeof politica !== 'object' || politica === null) return null;
  const { version, texto } = politica as Record<string, unknown>;
  if (typeof version !== 'string' || typeof texto !== 'string' || version === '' || texto === '')
    return null;
  return { version, texto };
};

export const mensajeDeEspera = (segundos: number | null): string => {
  const inicio = 'Demasiados intentos seguidos.';
  if (segundos === null || segundos <= 0) {
    return `${inicio} Espere unos minutos y vuelva a intentarlo.`;
  }
  const minutos = Math.ceil(segundos / 60);
  return minutos <= 1
    ? `${inicio} Espere un minuto y vuelva a intentarlo.`
    : `${inicio} Espere ${String(minutos)} minutos y vuelva a intentarlo.`;
};

export const segundosDeEspera = (cabeceras: Headers): number | null => {
  const valor = cabeceras.get('retry-after');
  if (valor === null) return null;
  const n = Number.parseInt(valor.trim(), 10);
  return Number.isNaN(n) ? null : n;
};
