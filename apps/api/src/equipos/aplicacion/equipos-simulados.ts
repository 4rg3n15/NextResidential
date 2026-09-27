/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F3 (corrección de la 15-L) · EQUIPOS SIMULADOS CON EQUIPOS REALES DADOS DE ALTA
 *
 * `PROVEEDOR_DE_EQUIPOS=simulado` es el modo por omisión (ADR-03), y con él
 * toda orden «funciona»: la apertura sale bien, la terminal recibe la foto…
 * en un equipo que no existe. Si además hay equipos reales dados de alta, el
 * día de la entrega eso es una apertura que no ocurre y nadie sabe por qué.
 *
 * Se dice en tres sitios, con la misma frase: al arrancar la API (bitácora),
 * en una franja fija de la consola y como FALLO del ensayo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const AVISO_DE_EQUIPOS_SIMULADOS =
  'Equipos simulados: las órdenes no llegan a ningún equipo real';

export interface EstadoDeEquiposSimulados {
  readonly simulado: boolean;
  readonly equiposRegistrados: number;
  /** La frase, sólo cuando hay equipos reales que no van a recibir nada. */
  readonly aviso: string | null;
}

export const estadoDeEquiposSimulados = (
  clase: string,
  equiposRegistrados: number,
): EstadoDeEquiposSimulados => {
  const simulado = clase === 'simulado';
  return {
    simulado,
    equiposRegistrados,
    aviso: simulado && equiposRegistrados > 0 ? AVISO_DE_EQUIPOS_SIMULADOS : null,
  };
};
