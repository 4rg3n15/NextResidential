import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs de SALIDA del tablero.
 *
 * Existen por dos razones distintas y las dos importan.
 *
 * 1. **El agregado no se serializa crudo** (§2.2). Aquí no hay agregado, pero
 *    sí una proyección de lectura, y publicarla tal cual convertiría la forma
 *    del repositorio en contrato público.
 * 2. **El cliente generado necesita un tipo.** Sin `@ApiOkResponse` apuntando a
 *    una clase decorada, el `openapi.json` describe la respuesta como un objeto
 *    vacío y `openapi-typescript` produce `unknown`: la consola compilaría con
 *    cualquier acceso a cualquier campo, que es exactamente la clase de defecto
 *    silencioso que esta etapa arrastraba (D-38).
 *
 * Las fechas salen como **ISO 8601 en texto**. JSON no tiene tipo fecha, y
 * declarar `Date` haría que el contrato prometiera algo que el transporte no
 * puede cumplir.
 */

export class VentanaDelDiaDto {
  @ApiProperty({ format: 'date-time', description: 'Medianoche local, inclusive' })
  desde!: string;

  @ApiProperty({ format: 'date-time', description: 'Medianoche local siguiente, exclusiva' })
  hasta!: string;

  @ApiProperty({
    example: 'America/Bogota',
    description:
      'Zona horaria de la copropiedad con la que se calculó «hoy». Se declara para que ' +
      'la consola no vuelva a interpretarlo con la zona del navegador.',
  })
  zonaHoraria!: string;
}

export class ConteosDelPadronDto {
  @ApiProperty({ example: 247 }) residentesActivos!: number;
  @ApiProperty({ example: 4 }) residentesAltaEnVentana!: number;
  @ApiProperty({ example: 183 }) vehiculosActivos!: number;
  @ApiProperty({ example: 12 }) vehiculosAltaEnVentana!: number;
}

export class ConteosDeVisitantesDto {
  @ApiProperty({
    example: 34,
    description: 'Autorizaciones activas que se cruzan con el día local',
  })
  autorizacionesDelDia!: number;

  @ApiProperty({
    example: 8,
    description:
      'Ingresos menos salidas del día. Aproximación declarada: una salida puede no ' +
      'registrarse por fallo de sensor (CU-05, excepción 6a). Nunca es negativo.',
  })
  dentroAhora!: number;
}

export class ConteosDeAlertasDto {
  @ApiProperty({ example: 3 }) pendientes!: number;

  @ApiProperty({
    type: String,
    enum: ['informativa', 'media', 'alta', 'critica'],
    nullable: true,
    description: 'Severidad más grave entre las pendientes; null si no hay ninguna',
  })
  severidadMaxima!: 'informativa' | 'media' | 'alta' | 'critica' | null;
}

export class IndicadoresDto {
  @ApiProperty({ type: ConteosDelPadronDto }) padron!: ConteosDelPadronDto;
  @ApiProperty({ type: ConteosDeVisitantesDto }) visitantes!: ConteosDeVisitantesDto;
  @ApiProperty({ type: ConteosDeAlertasDto }) alertas!: ConteosDeAlertasDto;
  @ApiProperty({ type: VentanaDelDiaDto }) ventana!: VentanaDelDiaDto;
}

export class FranjaDeAccesosDto {
  @ApiProperty({ minimum: 0, maximum: 23, description: 'Hora local de la copropiedad' })
  hora!: number;

  @ApiProperty({ example: 12 }) permitidos!: number;
  @ApiProperty({ example: 1 }) negados!: number;
}

export class AccesosPorHoraDto {
  @ApiProperty({
    type: [FranjaDeAccesosDto],
    description: 'Siempre 24 franjas, incluidas las de cero: el eje lo fija el servidor',
  })
  franjas!: FranjaDeAccesosDto[];

  @ApiProperty({ example: 'America/Bogota' }) zonaHoraria!: string;
  @ApiProperty({ format: 'date-time' }) desde!: string;
  @ApiProperty({ format: 'date-time' }) hasta!: string;
}

export class DispositivoDelTableroDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Talanquera Portería Principal' }) nombre!: string;

  @ApiProperty({ enum: ['camara_lpr', 'terminal_facial', 'rele', 'intercom', 'controlador_io'] })
  tipo!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true }) zonaId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'IP o FQDN del equipo. Solo se rellena para roles administrativos (C-11); ' +
      'para el resto llega null. NUNCA sale la credencial ni su referencia (RN-21).',
  })
  host!: string | null;

  @ApiProperty({ type: Number, nullable: true }) puerto!: number | null;
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) firmware!: string | null;

  @ApiProperty({
    enum: ['saludable', 'degradado', 'caido'],
    description:
      'Derivado del último latido contra el umbral de la copropiedad (migración 0020), ' +
      'no leído de la columna estado_salud, que puede ir por detrás.',
  })
  estado!: 'saludable' | 'degradado' | 'caido';

  @ApiProperty({ type: String, format: 'date-time', nullable: true }) ultimoLatido!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) ultimaSincronizacion!:
    | string
    | null;
  @ApiProperty({ type: Number, nullable: true }) segundosSinLatir!: number | null;
}

export class EstadoDeDispositivosDto {
  @ApiProperty({ type: [DispositivoDelTableroDto] })
  dispositivos!: DispositivoDelTableroDto[];

  @ApiProperty({ example: 3 }) saludables!: number;
  @ApiProperty({ example: 1 }) degradados!: number;
  @ApiProperty({ example: 0 }) caidos!: number;
}
