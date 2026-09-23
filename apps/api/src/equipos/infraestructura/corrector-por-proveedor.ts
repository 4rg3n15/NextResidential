import { aplicarCorreccion } from '@ncr/providers';
import type {
  CorrectorDeEquipo,
  DatosDeCorreccion,
  ResultadoDeCorreccionDeEquipo,
} from '../aplicacion/puertos';

/**
 * Aplica una corrección en el equipo, **desde el servidor y con firma**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NI UNA RUTA NI UN NOMBRE DE CAMPO AQUÍ
 *
 * Igual que la sonda: esta clase traduce una intención —«corrige el modo de
 * control»— y delega. Quién sabe que eso se escribe leyendo el documento
 * entero, cambiando un elemento y devolviéndolo completo es el paquete de
 * proveedores, y es donde tiene que saberse (KPI-11).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA CAPA SÍ APORTA
 *
 * El texto del resultado para la pantalla, y **el valor anterior y el nuevo**
 * de vuelta: sin eso, la constancia en `auditoria_seguridad` diría que alguien
 * corrigió algo y no qué. Reconstruir después quién dejó el equipo como está
 * sería imposible, que es justo lo que una auditoría necesita poder hacer.
 */
export class CorrectorPorProveedor implements CorrectorDeEquipo {
  constructor(private readonly peticion?: typeof fetch) {}

  async corregir(datos: DatosDeCorreccion): Promise<ResultadoDeCorreccionDeEquipo> {
    const resultado = await aplicarCorreccion({
      host: datos.host,
      puerto: datos.puerto,
      protocolo: datos.protocolo,
      usuario: datos.usuario,
      clave: datos.secreto,
      clase: datos.correccion,
      confirmadaPor: datos.confirmadaPor,
      ...(this.peticion === undefined ? {} : { peticion: this.peticion }),
    });

    return {
      correccion: datos.correccion,
      aplicada: resultado.aplicada,
      valorAnterior: resultado.valorAnterior,
      valorNuevo: resultado.valorNuevo,
      detalle: resultado.detalle,
    };
  }
}
