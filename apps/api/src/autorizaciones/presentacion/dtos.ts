import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/**
 * El DTO valida FORMA; el agregado valida VERDAD (§2.7.3). Aquí no se comprueba
 * que la vigencia sea coherente ni que el patrón tenga sentido: eso es del
 * objeto de valor, y duplicarlo aquí crearía dos verdades que se separan.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AQUÍ VIVÍAN CINCO DTO MUERTOS · D-92
 *
 * `PatronDto`, `CrearAutorizacionDto`, `AcompananteDto`, `MotivoDto` y
 * `VetarDto` estaban declarados aquí y **nadie los importaba**: los vivos son
 * los de `dtos-autorizacion.ts`, que es lo que el controlador usa. Eran copias
 * envejecidas con los mismos nombres.
 *
 * No era solo ruido. En OpenAPI el nombre de la clase ES el nombre del esquema,
 * así que dos clases con el mismo nombre se pisan y **solo una sobrevive en el
 * contrato**. El generador de clientes —TypeScript y Dart— produce entonces la
 * forma equivocada para la otra, sin un solo error. Se borraron, y el paso 10b
 * comprueba desde ahora que ningún nombre de esquema se repita.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Evento normalizado del Alarm Server. La ETAPA 15 traduce el XML del
 * fabricante a ESTA forma; la ingesta no conoce ninguna otra.
 */
export class EventoIngestaDto {
  @ApiProperty() @IsUUID() copropiedadId!: string;
  @ApiProperty() @IsString() @MaxLength(128) dispositivoId!: string;
  @ApiProperty({ enum: ['placa', 'facial', 'manual', 'remoto', 'tarjeta'] })
  @IsIn(['placa', 'facial', 'manual', 'remoto', 'tarjeta'])
  metodo!: 'placa' | 'facial' | 'manual' | 'remoto' | 'tarjeta';
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() personaId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(16) placaLeida?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() zonaId?: string;
  @ApiProperty({ description: 'Confianza de la lectura, 0..1' })
  @IsInt({ message: 'confianza se envía en centésimas enteras: 95 = 0,95' })
  @Min(0)
  @Max(100)
  confianzaCentesimas!: number;
  @ApiProperty({ description: 'Identificador del evento en el equipo (RN-17)' })
  @IsString()
  @MaxLength(128)
  referenciaExterna!: string;
}
