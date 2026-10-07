/**
 * El TOPE DE PLAZAS que se escribe en la consola (ronda 15-W): el de una
 * vivienda y el de la copropiedad por omisión.
 *
 * **Esto no es la regla; es el aviso.** La cota la imponen la API (DTO con
 * mínimo 1 y máximo 20, declarados en el contrato) y la base; aquí sólo se
 * evita enviar algo que volvería con un 400. El máximo es el de la plataforma
 * —`OCUPANTES_MAXIMO` del dominio—, que la consola no importa porque no
 * depende de `domain-core`: si cambia allí, el contrato lo publica y esta cifra
 * tiene que seguirlo.
 *
 * Que el tope de una vivienda no quede por debajo de sus plazas activas NO se
 * comprueba aquí: lo decide la base bajo su bloqueo, y la consola enseña su 409.
 */
export const TOPE_MAXIMO_DE_PLAZAS = 20;

/** Un entero de 1 a 20 escrito con cifras; nada más. */
export const topeValido = (texto: string): boolean =>
  /^\d{1,2}$/.test(texto) && Number(texto) >= 1 && Number(texto) <= TOPE_MAXIMO_DE_PLAZAS;
