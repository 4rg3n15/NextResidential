import type { CriteriosDeEventos } from '@ncr/domain-core';
import type { FiltrosDeAccesoDto } from './dtos';

/**
 * D-145 · traduce los filtros de acceso del DTO a los criterios del dominio.
 * Traducción, no reglas (§2.2): la placa la normaliza `FiltroDeEventos`. Lo
 * comparten el historial, la exportación y la línea de tiempo.
 */
export const criteriosDeAcceso = (
  dto: FiltrosDeAccesoDto,
): Pick<
  CriteriosDeEventos,
  | 'viviendaId'
  | 'personaId'
  | 'zonaId'
  | 'resultado'
  | 'motivo'
  | 'placa'
  | 'operadorId'
  | 'metodo'
  | 'identificacion'
> => ({
  viviendaId: dto.viviendaId ?? null,
  personaId: dto.personaId ?? null,
  zonaId: dto.zonaId ?? null,
  resultado: dto.resultado ?? null,
  motivo: dto.motivo ?? null,
  placa: dto.placa ?? null,
  operadorId: dto.operadorId ?? null,
  metodo: dto.metodo ?? null,
  identificacion: dto.identificacion ?? null,
});
