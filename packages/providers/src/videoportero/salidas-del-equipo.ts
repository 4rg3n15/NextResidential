import { ClienteDeEquipo } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import type { NodoDeSalidas } from '../nucleo/salidas';
import { construirArbolDeSalidas, leerBanderas } from './arbol-de-salidas';

/**
 * 15-P · P3 · pide al videoportero lo que declara de sus salidas y arma el
 * árbol. Cada documento es OPCIONAL: un 404 o un `notSupport` deja ese trozo
 * vacío y el árbol lo dice; lo que falla es la red (`EquipoInalcanzable`), y
 * eso sube tal cual. Las preguntas de unidades y submódulos sólo se hacen si
 * el equipo declara tenerlos.
 */
const documento = async (cliente: ClienteDeEquipo, proposito: string): Promise<string | null> => {
  const ruta = rutaPara(proposito, 'videoportero');
  const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta);
  return respuesta.ok && !/notSupport/i.test(respuesta.cuerpo) ? respuesta.cuerpo : null;
};

export const leerSalidasDelEquipo = async (
  conexion: OpcionesDeEquipo,
  nombreDelEquipo: string,
  puertaDeLaFicha: number | null,
): Promise<NodoDeSalidas> => {
  const cliente = new ClienteDeEquipo(conexion);
  const capacidades = await documento(
    cliente,
    'leer las capacidades de control de acceso del videoportero',
  );
  const ordenRemota = await documento(
    cliente,
    'leer qué órdenes admite la puerta desde la plataforma',
  );
  const banderas = leerBanderas(capacidades);
  const unidadesSeguras =
    banderas.estadoDeUnidades || banderas.unidadSegura
      ? await documento(cliente, 'leer el estado de las unidades de puerta segura')
      : null;
  const submodulos = banderas.submodulos
    ? await documento(cliente, 'leer los submódulos del videoportero')
    : null;
  return construirArbolDeSalidas(
    nombreDelEquipo,
    { capacidades, ordenRemota, unidadesSeguras, submodulos },
    puertaDeLaFicha,
  );
};
