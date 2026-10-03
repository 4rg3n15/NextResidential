/**
 * 15-Q2 · un proveedor real puesto DETRÁS de un túnel en memoria: el «vía Edge»
 * sin red. Lo usa la suite de contrato (C1: la misma suite, sin cambiar una
 * aserción) y lo pueden usar las pruebas de la API. El enlace es asíncrono y
 * serializa como el de verdad (`enlace-en-memoria.ts`), así que lo que pasa
 * aquí pasa por el mismo protocolo, la misma serialización y el mismo ejecutor
 * que en un sitio.
 */
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import { enlacesEnMemoria } from './enlace-en-memoria';
import { ejecutarOrdenes } from './ejecutor-remoto';
import { ProveedorRemoto } from './proveedor-remoto';
import { SesionDeTunel } from './sesion-de-tunel';

export const tunelEnMemoria = (
  real: ProveedorDeEquipos,
  opciones: { readonly conoce?: (dispositivoId: string) => boolean } = {},
) => {
  const [lado, otroLado] = enlacesEnMemoria();
  const api = new SesionDeTunel(lado, { paridad: 'par' });
  const edge = new SesionDeTunel(otroLado, { paridad: 'impar' });
  ejecutarOrdenes(edge, real, { conoce: opciones.conoce ?? (() => true) });
  // Las lecturas que el proveedor real observa cruzan ESPERADAS, como en la
  // fuente local: cuando la publicación termina, los observadores ya lo saben.
  void real.suscribir(async (lectura) => {
    await edge.pedir('lectura', lectura, { plazoMs: 5_000 });
  });
  const proveedor = new ProveedorRemoto({ sesion: () => api, fuente: new FuenteDePlacas() });
  return { proveedor, api, edge, cortar: () => lado.cortar() };
};

/**
 * C1 · cualquier caso de la suite de contrato, puesto detrás del túnel: mismo
 * mundo, mismo transporte de lecturas, y el proveedor que la suite ve es el
 * remoto. La suite no cambia una aserción.
 */
export const viaTunel = <
  C extends {
    readonly nombre: string;
    readonly montar: (mundo?: never) => { readonly proveedor: ProveedorDeEquipos };
  },
>(
  caso: C,
): C =>
  ({
    ...caso,
    nombre: `${caso.nombre} vía Edge (por el túnel)`,
    montar: (mundo?: never) => {
      const montado = caso.montar(mundo);
      return { ...montado, proveedor: tunelEnMemoria(montado.proveedor).proveedor };
    },
  }) as C;
