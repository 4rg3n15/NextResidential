import {
  BibliotecaLlena,
  VideoNoReproducible,
  SinCanalDeVideo,
  CapacidadNoSoportada,
  CredencialRechazada,
  DesafioVencido,
  EquipoAveriado,
  EquipoOcupado,
  OrdenSinConfirmar,
  PeticionRechazada,
  ReinicioNecesario,
} from './errores';
import { EquipoInalcanzable } from '../equipo/cliente';
import { RutaSinCanal } from '../equipo/catalogo-de-rutas';
import { AperturaNoSoportada } from '../equipo/puerta-remota';
import { RutaNoSoportada } from '../terminal/terminal-facial';
import { EquipoDecidePorSuCuenta } from '../camara/modo-de-control';
import { EquipoNoRegistrado } from '../hikvision/registro-de-equipos';
import { FotoNoAdmitida } from '../terminal/foto-del-rostro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL OPERADOR LEE CUANDO UNA ORDEN NO SALE · 15-L (A1 y Bloque I)
 *
 * El mensaje de cada error del paquete es para quien lo depura: lleva el
 * identificador del equipo, la ruta del fabricante, el `statusCode` y el
 * `subStatusCode`. Todo eso sigue yendo a la bitácora. A la consola —la
 * portería, la línea de tiempo— va ESTO: qué pasó y qué hacer, en una frase y
 * sin jerga. Con un código del fabricante conocido, su traducción (el mapa de
 * `errores-del-fabricante.ts`); sin él, lo que se sabe.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const motivoLegible = (error: unknown): string => {
  if (error instanceof CredencialRechazada) {
    return 'el equipo rechazó el usuario o la clave de servicio: corríjalos en la ficha del equipo';
  }
  if (error instanceof DesafioVencido)
    return 'el equipo pidió identificarse otra vez: repita la orden';
  if (error instanceof EquipoOcupado)
    return 'el equipo está ocupado: repita la orden en unos segundos';
  if (error instanceof ReinicioNecesario)
    return 'el equipo necesita reiniciarse para aplicar el cambio';
  if (error instanceof BibliotecaLlena) return 'la biblioteca de rostros del equipo está llena';
  if (error instanceof FotoNoAdmitida) return `la foto no sirve: ${error.legible}`;
  if (error instanceof VideoNoReproducible) {
    return (
      `el equipo entrega ${error.codec} en el canal ${error.canal} y el navegador no lo ` +
      'reproduce: cámbielo a H.264 en el equipo o elija otro canal en su ficha'
    );
  }
  if (error instanceof SinCanalDeVideo) {
    return 'el equipo no lista sus canales de video y su ficha no tiene uno: pulse «Probar conexión»';
  }
  if (error instanceof OrdenSinConfirmar) {
    return 'el equipo contestó sin confirmar la orden: puede que la puerta no se haya movido';
  }
  if (error instanceof CapacidadNoSoportada) {
    return error.porDesconocida
      ? 'aún no se sabe si este equipo admite esta orden: use «Probar conexión» en su ficha'
      : 'este equipo no admite esta orden desde la plataforma';
  }
  if (error instanceof EquipoDecidePorSuCuenta) {
    return 'el equipo decide por su cuenta: la plataforma no lo opera sin la atestación del instalador';
  }
  if (error instanceof RutaSinCanal) {
    return 'falta el número de puerta de este equipo: indíquelo en su ficha (Dispositivos)';
  }
  if (error instanceof RutaNoSoportada || error instanceof AperturaNoSoportada) {
    return 'este equipo no admite la apertura desde la plataforma';
  }
  if (error instanceof EquipoNoRegistrado) {
    return 'el equipo no está dado de alta o le falta la credencial de servicio';
  }
  if (error instanceof EquipoInalcanzable)
    return 'el equipo no respondió: revise que esté encendido y en la red';
  if (error instanceof EquipoAveriado || error instanceof PeticionRechazada) {
    return error.legible === undefined
      ? 'el equipo rechazó la orden'
      : `el equipo rechazó la orden: ${error.legible}`;
  }
  return 'el equipo rechazó la orden';
};
