import type { AmbitoDelResidente } from '@ncr/domain-core';
import type {
  AutorizacionDelResidente,
  DirectorioDelResidente,
  EventoDelResidente,
  FiltroDeHistorial,
  MiembroDeFamilia,
  VehiculoDelResidente,
  VinculoDeResidente,
  ViviendaDelResidente,
} from '../../src/residente/aplicacion/puertos';
import { COP_A, COP_B } from '../constantes';

/**
 * Doble en memoria del directorio del residente, con DOS VIVIENDAS POBLADAS en
 * la misma copropiedad.
 *
 * Esa es la única razón de que exista. El eje de aislamiento que la ETAPA 11
 * añade —residente contra residente **dentro** del mismo conjunto— no se puede
 * ejercer con una sola vivienda: con una, cualquier implementación que filtre
 * solo por copropiedad pasa en verde. Hacen falta dos con datos distintos y
 * distinguibles a simple vista, y por eso los nombres de la vivienda vecina son
 * literales que la prueba busca en el cuerpo de la respuesta.
 *
 * El doble filtra por `viviendaId` de verdad, igual que el adaptador SQL. Si
 * filtrara solo por copropiedad, sería un doble que aprueba lo que el
 * adaptador real rechaza —y entonces la suite no probaría el sistema, probaría
 * el doble—.
 */
export const VIVIENDA_1 = '20000000-0000-4000-8000-000000000001';
export const VIVIENDA_2 = '20000000-0000-4000-8000-000000000002';
export const VIVIENDA_B = '20000000-0000-4000-8000-0000000000b1';

export const USUARIO_R1 = '30000000-0000-4000-8000-000000000001';
export const USUARIO_R2 = '30000000-0000-4000-8000-000000000002';
export const USUARIO_RB = '30000000-0000-4000-8000-0000000000b1';
export const USUARIO_SIN_VIVIENDA = '30000000-0000-4000-8000-00000000ffff';

/**
 * Marcas que NUNCA deben aparecer en la respuesta del vecino.
 *
 * No está «Casa 7» a propósito, y la ausencia enseña algo: el identificador que
 * viaja es `7`, y «Casa» es la etiqueta de la copropiedad. La palabra se pinta y
 * nunca se guarda (H-3 del alta de viviendas), así que buscar «Casa 7» en el
 * cuerpo no encontraría nada ni habiendo fuga. Un `7` suelto tampoco sirve de
 * marca: aparece dentro de cualquier UUID. Las marcas tienen que ser
 * inconfundibles, y el identificador de la vivienda vecina lo es.
 */
export const MARCAS_VIVIENDA_2 = [VIVIENDA_2, 'Ruiz Vecino', 'XYZ789', 'Visitante del vecino'];

interface Datos {
  readonly vivienda: ViviendaDelResidente;
  readonly familia: readonly MiembroDeFamilia[];
  readonly vehiculos: readonly VehiculoDelResidente[];
  readonly autorizaciones: readonly AutorizacionDelResidente[];
  readonly eventos: readonly EventoDelResidente[];
}

const ahora = new Date('2026-09-18T12:00:00.000Z');
const enHoras = (h: number) => new Date(ahora.getTime() + h * 3_600_000).toISOString();

const vivienda = (
  id: string,
  copropiedadId: string,
  identificador: string,
  agrupacion: string | null,
  activa = true,
): ViviendaDelResidente => ({
  id,
  identificador,
  agrupacion,
  etiquetaVivienda: 'Casa',
  etiquetaAgrupacion: 'Manzana',
  direccion: 'Calle inventada 00',
  copropiedadNombre: copropiedadId === COP_A ? 'Copropiedad A' : 'Copropiedad B',
  estadoAdministrativo: 'al_dia',
  activa,
});

const DATOS: ReadonlyMap<string, Datos> = new Map([
  [
    `${COP_A}:${VIVIENDA_1}`,
    {
      vivienda: vivienda(VIVIENDA_1, COP_A, '42', 'B'),
      familia: [
        {
          residenteId: '40000000-0000-4000-8000-000000000001',
          nombre: 'Maria Titular',
          parentesco: 'Propietario',
          esTitular: true,
          nivelAcceso: 'acceso_completo',
          activo: true,
        },
        {
          residenteId: '40000000-0000-4000-8000-000000000002',
          nombre: 'Hija Titular',
          parentesco: 'Hija',
          esTitular: false,
          nivelAcceso: 'solo_ingreso',
          activo: true,
        },
      ],
      vehiculos: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          placa: 'ABC123',
          marca: 'Marca',
          modelo: 'Modelo',
          color: 'Blanco',
          esPrincipal: true,
          activo: true,
        },
      ],
      autorizaciones: [
        {
          id: '60000000-0000-4000-8000-000000000001',
          visitante: 'Visitante propio',
          tipo: 'unica',
          desde: enHoras(-1),
          hasta: enHoras(3),
          placa: 'DEF456',
          permiteAccesoVehicular: true,
          estado: 'activa',
          acompanantes: 1,
        },
      ],
      eventos: [
        {
          id: '70000000-0000-4000-8000-000000000001',
          ocurridoEn: enHoras(-2),
          tipo: 'acceso',
          resultado: 'permitido',
          motivo: null,
          metodo: 'placa',
          placaDetectada: 'DEF456',
          persona: 'Visitante propio',
          zona: null,
          decididoPorEdge: false,
        },
      ],
    },
  ],
  [
    `${COP_A}:${VIVIENDA_2}`,
    {
      vivienda: vivienda(VIVIENDA_2, COP_A, '7', 'C'),
      familia: [
        {
          residenteId: '40000000-0000-4000-8000-0000000000a1',
          nombre: 'Ruiz Vecino',
          parentesco: 'Propietario',
          esTitular: true,
          nivelAcceso: 'acceso_completo',
          activo: true,
        },
      ],
      vehiculos: [
        {
          id: '50000000-0000-4000-8000-0000000000a1',
          placa: 'XYZ789',
          marca: 'Marca',
          modelo: 'Modelo',
          color: 'Negro',
          esPrincipal: true,
          activo: true,
        },
      ],
      autorizaciones: [
        {
          id: '60000000-0000-4000-8000-0000000000a1',
          visitante: 'Visitante del vecino',
          tipo: 'unica',
          desde: enHoras(-1),
          hasta: enHoras(5),
          placa: 'XYZ789',
          permiteAccesoVehicular: true,
          estado: 'activa',
          acompanantes: 0,
        },
      ],
      eventos: [
        {
          id: '70000000-0000-4000-8000-0000000000a1',
          ocurridoEn: enHoras(-3),
          tipo: 'acceso',
          resultado: 'negado',
          motivo: 'LISTA_NEGRA',
          metodo: 'placa',
          placaDetectada: 'XYZ789',
          persona: 'Visitante del vecino',
          zona: null,
          decididoPorEdge: false,
        },
      ],
    },
  ],
  [
    `${COP_B}:${VIVIENDA_B}`,
    {
      vivienda: vivienda(VIVIENDA_B, COP_B, '1', null),
      familia: [],
      vehiculos: [],
      autorizaciones: [],
      eventos: [],
    },
  ],
]);

const VINCULOS: ReadonlyMap<string, VinculoDeResidente> = new Map([
  [
    USUARIO_R1,
    {
      copropiedadId: COP_A,
      viviendaId: VIVIENDA_1,
      residenteId: '40000000-0000-4000-8000-000000000001',
      personaId: '80000000-0000-4000-8000-000000000001',
      esTitular: true,
      nivelAcceso: 'acceso_completo',
    },
  ],
  [
    USUARIO_R2,
    {
      copropiedadId: COP_A,
      viviendaId: VIVIENDA_2,
      residenteId: '40000000-0000-4000-8000-0000000000a1',
      personaId: '80000000-0000-4000-8000-0000000000a1',
      esTitular: true,
      nivelAcceso: 'acceso_completo',
    },
  ],
  [
    USUARIO_RB,
    {
      copropiedadId: COP_B,
      viviendaId: VIVIENDA_B,
      residenteId: '40000000-0000-4000-8000-0000000000b1',
      personaId: '80000000-0000-4000-8000-0000000000b1',
      esTitular: true,
      nivelAcceso: 'solo_ingreso',
    },
  ],
]);

export class DirectorioDelResidenteEnMemoria implements DirectorioDelResidente {
  private de(ambito: AmbitoDelResidente): Datos | undefined {
    return DATOS.get(`${ambito.copropiedadId}:${ambito.viviendaId}`);
  }

  async vinculoDe(usuarioId: string): Promise<VinculoDeResidente | null> {
    return VINCULOS.get(usuarioId) ?? null;
  }

  async vivienda(ambito: AmbitoDelResidente): Promise<ViviendaDelResidente | null> {
    return this.de(ambito)?.vivienda ?? null;
  }

  async familia(ambito: AmbitoDelResidente): Promise<readonly MiembroDeFamilia[]> {
    return this.de(ambito)?.familia ?? [];
  }

  async vehiculos(ambito: AmbitoDelResidente): Promise<readonly VehiculoDelResidente[]> {
    return this.de(ambito)?.vehiculos ?? [];
  }

  async autorizaciones(ambito: AmbitoDelResidente): Promise<readonly AutorizacionDelResidente[]> {
    return this.de(ambito)?.autorizaciones ?? [];
  }

  async historial(
    ambito: AmbitoDelResidente,
    filtro: FiltroDeHistorial,
  ): Promise<readonly EventoDelResidente[]> {
    return (this.de(ambito)?.eventos ?? []).slice(0, filtro.limite);
  }
}
