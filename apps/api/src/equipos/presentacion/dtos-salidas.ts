import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { recorrerSalidas } from '@ncr/providers';
import type { NodoDeSalidas } from '@ncr/providers';
import type { PuntoDeAcceso } from '../aplicacion/puntos-de-acceso';
import { LONGITUD_MAXIMA_DEL_NOMBRE } from '../aplicacion/puntos-de-acceso';
import type { VistaDeSalidas } from '../aplicacion/salidas-del-equipo';

/**
 * 15-P · P3 · el árbol de salidas viaja PLANO —cada nodo con su ruta, su padre
 * y su nivel—: un esquema recursivo complica los clientes generados (TS y
 * Dart) sin aportar nada que la ruta no diga. El recorrido es el único del
 * árbol (`recorrerSalidas`, R3).
 */
export class NodoDeSalidasDto {
  @ApiProperty({ type: String, description: '`equipo/propio/puerta-1`' }) ruta!: string;
  @ApiProperty({ type: String, nullable: true }) padre!: string | null;
  @ApiProperty({ type: Number, description: '1 equipo · 2 módulo · 3 salida' }) nivel!: number;
  @ApiProperty({ enum: ['equipo', 'modulo', 'salida'] }) tipo!: 'equipo' | 'modulo' | 'salida';
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: Number, nullable: true }) numeroDePuerta!: number | null;
  @ApiProperty({
    enum: ['en_linea', 'fuera_de_linea', 'manipulada', 'averiada'],
    nullable: true,
  })
  estado!: 'en_linea' | 'fuera_de_linea' | 'manipulada' | 'averiada' | null;
  @ApiProperty({ type: String, nullable: true }) nota!: string | null;
}

export class PuntoDeAccesoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) dispositivoId!: string;
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: Number }) numeroDePuerta!: number;
  @ApiProperty({ type: String, nullable: true }) modulo!: string | null;
  @ApiProperty({ type: String, nullable: true }) rutaEnElEquipo!: string | null;
  @ApiProperty({ enum: ['descubierto', 'manual'] }) origen!: 'descubierto' | 'manual';
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) descubiertoEn!: string | null;
}

export class SalidasDelEquipoDto {
  @ApiProperty({ type: [NodoDeSalidasDto], description: 'Vacío si no se pudo leer el equipo' })
  arbol!: NodoDeSalidasDto[];
  @ApiProperty({ type: String, nullable: true }) motivoSinArbol!: string | null;
  @ApiProperty({ type: [PuntoDeAccesoDto] }) puntos!: PuntoDeAccesoDto[];
}

export class PuntosDeAccesoDto {
  @ApiProperty({ type: [PuntoDeAccesoDto] }) puntos!: PuntoDeAccesoDto[];
}

export class NombreDePuntoDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: LONGITUD_MAXIMA_DEL_NOMBRE })
  @IsString()
  @MinLength(1)
  @MaxLength(LONGITUD_MAXIMA_DEL_NOMBRE)
  nombre!: string;
}

export const aPuntoDto = (p: PuntoDeAcceso): PuntoDeAccesoDto => ({
  id: p.id,
  dispositivoId: p.dispositivoId,
  nombre: p.nombre,
  numeroDePuerta: p.numeroDePuerta,
  modulo: p.modulo,
  rutaEnElEquipo: p.rutaEnElEquipo,
  origen: p.origen,
  descubiertoEn: p.descubiertoEn === null ? null : p.descubiertoEn.toISOString(),
});

const aNodosDto = (arbol: NodoDeSalidas): NodoDeSalidasDto[] =>
  recorrerSalidas(arbol).map(({ nodo, nivel, ruta, padre }) => ({
    ruta,
    padre,
    nivel,
    tipo: nodo.tipo,
    nombre: nodo.nombre,
    numeroDePuerta: nodo.numeroDePuerta,
    estado: nodo.estado,
    nota: nodo.nota,
  }));

export const aSalidasDto = (v: VistaDeSalidas): SalidasDelEquipoDto => ({
  arbol: v.arbol === null ? [] : aNodosDto(v.arbol),
  motivoSinArbol: v.motivoSinArbol,
  puntos: v.puntos.map(aPuntoDto),
});
