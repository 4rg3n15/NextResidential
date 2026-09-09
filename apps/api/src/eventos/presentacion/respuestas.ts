import { ApiProperty } from '@nestjs/swagger';
import { TIPOS_DE_EVENTO } from '@ncr/domain-core';
import { ENUM_MOTIVO_ACCESO } from '../../comun/presentacion/respuestas';

/**
 * DTOs de salida de eventos y alertas.
 *
 * `motivo` se declara con el **enumerado del dominio**, no como texto libre:
 * es lo que permite que la consola distinga `LISTA_NEGRA` de `PLACA_DESCONOCIDA`
 * con el compilador de su lado. El mockup mezcla los dos en una sola línea
 * («Sin Registro / Lista Negra») y la auditoría lo marcó: en el dominio son
 * excluyentes y con precedencia definida, y la consola debe mostrar UNO.
 */
export class EventoRegistradoDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) copropiedadId!: string;
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty({ enum: TIPOS_DE_EVENTO }) tipo!: string;
  @ApiProperty({ enum: ['permitido', 'negado'] }) resultado!: 'permitido' | 'negado';

  @ApiProperty({
    enum: ENUM_MOTIVO_ACCESO,
    nullable: true,
    description:
      'Motivo tipado de la denegación; null cuando el acceso fue permitido. La precedencia ' +
      'del motor (listaNegra > vigencia > patrón > zona) decide cuál se sella.',
  })
  motivo!: string | null;

  @ApiProperty({ enum: ['placa', 'facial', 'manual', 'remoto', 'tarjeta'] }) metodo!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) personaId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) viviendaId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) zonaId!: string | null;
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty({ nullable: true, example: 'ABC123' }) placaDetectada!: string | null;
  @ApiProperty({ nullable: true, minimum: 0, maximum: 1 }) confianza!: number | null;
  @ApiProperty({ description: 'Regla que determinó el resultado' }) reglaAplicada!: string;

  @ApiProperty({
    description: 'Versión de reglas con la que se decidió; hace auditable la decisión del Edge',
  })
  versionReglas!: number;

  @ApiProperty({ format: 'uuid', nullable: true }) operadorId!: string | null;
  @ApiProperty({ nullable: true }) motivoManual!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) evidenciaId!: string | null;

  @ApiProperty({
    description: 'Resuelto localmente por el Edge con caché de reglas (RN-16, CA-21, KPI-31)',
  })
  decididoPorEdge!: boolean;
}

export class PaginaDeEventosDto {
  @ApiProperty({ type: [EventoRegistradoDto] }) filas!: EventoRegistradoDto[];

  @ApiProperty({
    nullable: true,
    description: 'Cursor opaco de la siguiente página; null cuando no hay más',
  })
  siguiente!: string | null;
}

export class UrlDeEvidenciaDto {
  @ApiProperty({
    description:
      'URL firmada de vida corta (120 s) al bucket privado. No se cachea ni se persiste: ' +
      'el enlace acaba en el historial del navegador y ahí sigue siendo válido (RN-21).',
  })
  url!: string;
}

export class AlertaExpuestaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({
    enum: [
      'lista_negra',
      'sabotaje',
      'dispositivo_caido',
      'acceso_dudoso',
      'panico',
      'apertura_fallida',
    ],
  })
  tipo!: string;

  @ApiProperty({ enum: ['informativa', 'media', 'alta', 'critica'] }) severidad!: string;
  @ApiProperty({ enum: ['abierta', 'en_atencion', 'resuelta'] }) estado!: string;
  @ApiProperty({ format: 'date-time' }) generadaEn!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) escaladaEn!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) eventoId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) dispositivoId!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'KPI-25 medido, no supuesto: null mientras no se haya escalado',
  })
  escaladaDentroDelPlazo!: boolean | null;

  @ApiProperty({ nullable: true }) notas!: string | null;
}
