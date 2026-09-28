import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { RechazoDePortero } from '../aplicacion/porteros';

/** El rechazo de un caso de uso de porteros, en HTTP. Mensajes para quien opera la consola. */
export const rechazoDePortero = (e: RechazoDePortero): Error =>
  e.motivo === 'FORMATO'
    ? new BadRequestException(e.detalle)
    : e.motivo === 'DUPLICADO'
      ? new ConflictException('Ese portero ya existe en esta copropiedad')
      : e.motivo === 'NO_ENCONTRADO'
        ? new NotFoundException('Portero no encontrado')
        : e.motivo === 'CUPO'
          ? new ConflictException(
              'La copropiedad alcanzó su cupo de porteros activos: súbalo o desactive a uno antes',
            )
          : e.motivo === 'POOL_AGOTADO'
            ? new ConflictException(
                'Ya se asignaron los 999 números de portero de esta copropiedad',
              )
            : new BadRequestException('El proveedor de identidad rechazó el alta');
