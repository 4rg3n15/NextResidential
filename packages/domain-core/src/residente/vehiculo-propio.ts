import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import { Placa } from '../padron/placa';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VEHÍCULO PROPIO DEL RESIDENTE · ETAPA 15-I (D5 a, 3.4, ADR-026)
 *
 * El residente registra los vehículos de su vivienda y quedan ACTIVOS AL
 * INSTANTE: el motor los trata como vehículos del padrón. Uno o más ocupantes
 * por vehículo, en cualquier combinación, y NINGÚN límite por ocupante: el
 * único tope es por VIVIENDA (2 por omisión, lo fija el superadministrador) y
 * lo impone la BASE, no esta función —dos altas simultáneas pasan las dos por
 * aquí y la base decide cuál entra (ADR-04)—.
 *
 * Aquí se valida la FORMA y la pertenencia de los ocupantes; el motivo del
 * tope se declara aquí para que la app y la consola lo expliquen igual.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const TIPOS_DE_VEHICULO = ['automovil', 'motocicleta', 'bicicleta', 'otro'] as const;
export type TipoDeVehiculo = (typeof TIPOS_DE_VEHICULO)[number];

export type MotivoDeNoRegistrarVehiculo =
  | 'TOPE_ALCANZADO'
  | 'PLACA_DUPLICADA'
  | 'VIVIENDA_INACTIVA'
  | 'OCUPANTE_AJENO'
  | 'SIN_OCUPANTES'
  | 'DATOS_INVALIDOS';

export interface SolicitudDeVehiculoPropio {
  readonly placa: string;
  readonly color: string;
  readonly modelo: string;
  readonly marca: string | null;
  readonly tipo: string;
  /** `residenteId` de los ocupantes vinculados; uno o más. */
  readonly ocupantes: readonly string[];
}

export interface VehiculoPropioValido {
  readonly placa: string;
  readonly color: string;
  readonly modelo: string;
  readonly marca: string | null;
  readonly tipo: TipoDeVehiculo;
  readonly ocupantes: readonly string[];
}

export interface RechazoDeVehiculo {
  readonly motivo: MotivoDeNoRegistrarVehiculo;
  readonly detalle: string;
}

const texto = (valor: string, maximo: number): string | null => {
  // eslint-disable-next-line no-control-regex -- es justo lo que hay que quitar
  const limpio = valor
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  return limpio.length >= 1 && limpio.length <= maximo ? limpio : null;
};

export const validarVehiculoPropio = (
  s: SolicitudDeVehiculoPropio,
  ocupantesDeLaVivienda: readonly string[],
): Resultado<VehiculoPropioValido, RechazoDeVehiculo> => {
  const placa = Placa.crear(s.placa);
  if (!placa.ok) return fallo({ motivo: 'DATOS_INVALIDOS', detalle: placa.error.detalle });
  const color = texto(s.color, 40);
  const modelo = texto(s.modelo, 60);
  if (color === null || modelo === null) {
    return fallo({ motivo: 'DATOS_INVALIDOS', detalle: 'Color y modelo son obligatorios' });
  }
  const marca = s.marca === null ? null : texto(s.marca, 60);
  if (!(TIPOS_DE_VEHICULO as readonly string[]).includes(s.tipo)) {
    return fallo({ motivo: 'DATOS_INVALIDOS', detalle: 'Tipo de vehículo desconocido' });
  }
  const ocupantes = [...new Set(s.ocupantes)];
  if (ocupantes.length === 0) {
    return fallo({ motivo: 'SIN_OCUPANTES', detalle: explicacionDeVehiculo('SIN_OCUPANTES') });
  }
  if (ocupantes.some((o) => !ocupantesDeLaVivienda.includes(o))) {
    return fallo({ motivo: 'OCUPANTE_AJENO', detalle: explicacionDeVehiculo('OCUPANTE_AJENO') });
  }
  return exito({
    placa: placa.valor.valor,
    color,
    modelo,
    marca,
    tipo: s.tipo as TipoDeVehiculo,
    ocupantes,
  });
};

export const explicacionDeVehiculo = (
  motivo: MotivoDeNoRegistrarVehiculo,
  tope?: number,
): string => {
  switch (motivo) {
    case 'TOPE_ALCANZADO':
      return `Su vivienda ya tiene ${tope === undefined ? 'el máximo de' : String(tope)} vehículo(s) propio(s) registrados por sus ocupantes. A partir de aquí, el superadministrador de su copropiedad es quien registra vehículos adicionales a nombre de la vivienda.`;
    case 'PLACA_DUPLICADA':
      return 'Esa placa ya está registrada y activa en el conjunto.';
    case 'VIVIENDA_INACTIVA':
      return 'Su vivienda está inactiva: no se pueden registrar vehículos nuevos.';
    case 'OCUPANTE_AJENO':
      return 'Solo puede vincular ocupantes de su propia vivienda.';
    case 'SIN_OCUPANTES':
      return 'Vincule el vehículo al menos a un ocupante de la vivienda.';
    case 'DATOS_INVALIDOS':
      return 'Revise la placa, el color, el modelo y el tipo del vehículo.';
  }
};
