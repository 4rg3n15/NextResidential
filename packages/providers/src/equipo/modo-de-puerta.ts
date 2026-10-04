import type { ResultadoAccionamiento } from '@ncr/domain-core';
import type { ModoDeSalida } from '../nucleo/proveedor';
import { ClienteDeEquipo } from './cliente';
import type { OpcionesDeEquipo } from './cliente';
import { rutaPara } from './catalogo-de-rutas';
import { abrirPuertaRemota } from './puerta-remota';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · P-25 · PUERTA LIBRE, BLOQUEADA O NORMAL · `RemoteControl/door/{canal}`
 *
 * La MISMA ruta, el MISMO cuerpo y la MISMA confirmación que la apertura que
 * abrió en sitio el 26/09 (`puerta-remota.ts`): sólo cambia la orden.
 *
 *   libre     → `alwaysOpen`  (la puerta queda abierta hasta nueva orden)
 *   bloqueada → `alwaysClose` (ninguna credencial la abre)
 *   normal    → `close`       (vuelve a su modo controlado)
 *
 * [SUPUESTO] S-15R-03 · que `close` devuelve la puerta a su modo normal tras
 * `alwaysOpen` o `alwaysClose` es lo que describe la documentación ISAPI de
 * `RemoteControlDoor`; NO se ha demostrado en sitio. Hasta entonces la
 * reversión automática se registra como «aceptada por el equipo», no como
 * «puerta en modo normal» (H-1), y la guía de validación lo pide probar.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ORDEN_DEL_MODO: Readonly<Record<ModoDeSalida, string>> = {
  libre: 'alwaysOpen',
  bloqueada: 'alwaysClose',
  normal: 'close',
};

export type FamiliaConPuerta = 'videoportero' | 'terminal';

const PROPOSITO: Readonly<Record<FamiliaConPuerta, string>> = {
  videoportero: 'abrir la puerta del videoportero',
  terminal: 'abrir la puerta desde la plataforma',
};

export const fijarModoDePuerta = async (
  conexion: OpcionesDeEquipo,
  familia: FamiliaConPuerta,
  numeroDePuerta: number,
  dispositivoId: string,
  modo: ModoDeSalida,
): Promise<ResultadoAccionamiento> => {
  const ruta = rutaPara(PROPOSITO[familia], familia, numeroDePuerta);
  const contenido = ruta.cuerpo?.contenido;
  const cambiado = contenido?.replace('<cmd>open</cmd>', `<cmd>${ORDEN_DEL_MODO[modo]}</cmd>`);
  if (ruta.cuerpo === undefined || cambiado === undefined || cambiado === contenido) {
    throw new Error(`la ruta «${ruta.proposito}» no admite cambiar el modo de la puerta`);
  }
  return abrirPuertaRemota(
    new ClienteDeEquipo(conexion),
    {
      ...ruta,
      proposito: `dejar la puerta en modo ${modo}`,
      cuerpo: { ...ruta.cuerpo, contenido: cambiado },
    },
    dispositivoId,
  );
};
