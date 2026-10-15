import { BadRequestException, NotFoundException } from '@nestjs/common';
import { conflicto } from '../..//comun/conflicto';
import type { RechazoDePortero } from '../aplicacion/porteros';

/** El rechazo de un caso de uso de porteros, en HTTP. Mensajes para quien opera la consola. */
export const rechazoDePortero = (e: RechazoDePortero): Error =>
  e.motivo === 'FORMATO'
    ? new BadRequestException(e.detalle)
    : e.motivo === 'DUPLICADO'
      ? conflicto('PORTERO_DUPLICADO', 'Ese portero ya existe en esta copropiedad')
      : e.motivo === 'NO_ENCONTRADO'
        ? new NotFoundException('Portero no encontrado')
        : e.motivo === 'CUPO'
          ? conflicto(
              'CUPO_DE_PORTEROS',
              'La copropiedad alcanzó su cupo de porteros activos: súbalo o desactive a uno antes',
            )
          : e.motivo === 'POOL_AGOTADO'
            ? conflicto(
                'NUMEROS_DE_PORTERO_AGOTADOS',
                'Ya se asignaron los 999 números de portero de esta copropiedad',
              )
            : new BadRequestException('El proveedor de identidad rechazó el alta');
