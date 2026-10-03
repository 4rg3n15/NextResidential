import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 15-R · B3 · la suscripción Web Push tal como la entrega `PushManager` del
 * navegador (`subscription.toJSON()`). El DTO valida FORMA; que el endpoint
 * sea de un servicio de push lo decide la aplicación (lista blanca, SSRF).
 */
export class LlavesDeSuscripcionDto {
  @ApiProperty({ description: 'Llave pública ECDH P-256 del navegador, base64url (65 bytes)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{86,88}$/, { message: 'p256dh no es una llave P-256 en base64url' })
  p256dh!: string;

  @ApiProperty({ description: 'Secreto de autenticación del navegador, base64url (16 bytes)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{21,24}$/, { message: 'auth no son 16 bytes en base64url' })
  auth!: string;
}

export class SuscripcionWebPushDto {
  @ApiProperty({ maxLength: 4096, example: 'https://fcm.googleapis.com/fcm/send/…' })
  @IsString()
  @MaxLength(4096)
  @Matches(/^https?:\/\/\S+$/, { message: 'endpoint debe ser una URL' })
  endpoint!: string;

  @ApiProperty({ type: LlavesDeSuscripcionDto })
  @ValidateNested()
  @Type(() => LlavesDeSuscripcionDto)
  keys!: LlavesDeSuscripcionDto;
}

export class BajaDeSuscripcionDto {
  @ApiProperty({ maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  endpoint!: string;
}

export class EstadoDeAvisosWebDto {
  @ApiProperty({ description: 'Falso si la API no tiene llaves VAPID: no hay avisos al teléfono' })
  disponible!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Llave pública VAPID (base64url)' })
  clavePublica!: string | null;
}

export class SuscripcionRegistradaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class SuscripcionAnuladaDto {
  @ApiProperty() anulada!: boolean;
}
