import { ApiProperty } from '@nestjs/swagger';
import type { EstadoDelEquipo } from '../aplicacion/estado-del-equipo';

/**
 * E5 (15-M) · el estado unificado de un equipo tal como sale por HTTP. Campo a
 * campo desde `EstadoDelEquipo`: la lista, la ficha y el tablero devuelven ESTE
 * mismo objeto, calculado por la misma función con las mismas entradas.
 */
export class EstadoDelEquipoDto {
  @ApiProperty({
    type: String,
    enum: ['en_linea', 'degradado', 'fuera_de_linea', 'sin_comprobar'],
    description:
      'Una sola fuente de verdad: última señal (latido, evento, escucha o sondeo) ' +
      'contra el umbral de la copropiedad, con la credencial y la escucha por delante',
  })
  enLinea!: string;

  @ApiProperty({ type: String, description: 'Por qué, en una frase para la pantalla' })
  motivo!: string;

  @ApiProperty({ type: Boolean, nullable: true, description: '`null` = nadie lo ha sondeado' })
  alcanzable!: boolean | null;

  /** Si el equipo aceptó el usuario y la clave de servicio (nunca los datos: RN-21). */
  @ApiProperty({ type: String, enum: ['aceptada', 'rechazada', 'sin_comprobar'] })
  autenticacion!: string;

  @ApiProperty({ type: Number, nullable: true }) autenticacionRechazadaHaceMin!: number | null;

  @ApiProperty({ type: String, enum: ['abierta', 'cerrada', 'rechazada', 'no_aplica'] })
  escucha!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true }) ultimoEvento!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) ultimoLatido!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) ultimaSenal!: string | null;
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

/** Campo a campo, nunca `spread`: lo que sale es una decisión (§7.1). */
export const aEstadoDelEquipoDto = (e: EstadoDelEquipo): EstadoDelEquipoDto => ({
  enLinea: e.enLinea,
  motivo: e.motivo,
  alcanzable: e.alcanzable,
  autenticacion: e.autenticacion,
  autenticacionRechazadaHaceMin: e.autenticacionRechazadaHaceMin,
  escucha: e.escucha,
  ultimoEvento: iso(e.ultimoEvento),
  ultimoLatido: iso(e.ultimoLatido),
  ultimaSenal: iso(e.ultimaSenal),
});
