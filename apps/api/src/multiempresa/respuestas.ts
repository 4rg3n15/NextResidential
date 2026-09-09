import { ApiProperty } from '@nestjs/swagger';
import { ROLES } from '../autenticacion/dominio/claims';

export class CopropiedadDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({
    enum: [...ROLES],
    description: 'Rol con el que el llamante alcanza esta copropiedad',
  })
  alcance!: string;
}

export class IngestaAceptadaDto {
  @ApiProperty({ example: true }) aceptado!: boolean;
}
