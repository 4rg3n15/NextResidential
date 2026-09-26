import type { AmbitoDelResidente, MotivoDeNoAutorizar } from '@ncr/domain-core';
import type {
  AutorizacionDelResidente,
  AutorizacionesDelResidente,
  DirectorioDelResidente,
  HechosDeLaBase,
  NotificacionesDelResidente,
  NuevaAutorizacion,
  ZonaParaResidente,
  ZonasDelResidente,
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
          nivelAcceso: 'completo',
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
          nivelAcceso: 'completo',
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
      nivelAcceso: 'completo',
      permiteAutorizar: true,
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
      nivelAcceso: 'completo',
      permiteAutorizar: true,
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
      permiteAutorizar: false,
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS TRES PUERTOS DE 11-B, EN MEMORIA
 *
 * El de escritura es el que importa para el segundo eje. Guarda lo creado
 * **bajo la clave del ámbito que recibió**, igual que el adaptador SQL escribe
 * con el `vivienda_id` del ámbito. Si guardara en una lista plana, la prueba de
 * que «lo que crea R1 no aparece en la vivienda de R2» pasaría con cualquier
 * implementación, incluida una rota.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export class AutorizacionesDelResidenteEnMemoria implements AutorizacionesDelResidente {
  /**
   * La última instancia construida, que es la que la aplicación de pruebas
   * está usando. La suite necesita mirar DÓNDE cayó lo escrito, y la fábrica
   * de Nest no devuelve la instancia. Una variable estática es fea; la
   * alternativa —exponer un puerto de lectura solo para la prueba— habría sido
   * peor: añadir superficie de producción para que una prueba se vea bien.
   */
  static ultima: AutorizacionesDelResidenteEnMemoria | undefined;

  constructor() {
    AutorizacionesDelResidenteEnMemoria.ultima = this;
  }

  /** `copropiedad:vivienda` → autorizaciones creadas. */
  readonly creadas = new Map<string, { id: string; nueva: NuevaAutorizacion }[]>();

  /** Identificadores únicos en todo el doble, no por vivienda. Ver abajo. */
  private siguiente = 0;
  /** Se pueden torcer desde la prueba para ejercer cada regla. */
  hechos: HechosDeLaBase = {
    visitanteVetado: false,
    viviendaActiva: true,
    placaYaActiva: false,
  };

  async hechosParaAutorizar(): Promise<HechosDeLaBase> {
    return this.hechos;
  }

  async crearAutorizacion(
    ambito: AmbitoDelResidente,
    _creadaPor: { readonly usuarioId: string; readonly residenteId: string },
    nueva: NuevaAutorizacion,
  ): Promise<
    | { readonly ok: true; readonly id: string; readonly repetida: boolean }
    | { readonly ok: false; readonly motivo: MotivoDeNoAutorizar }
  > {
    const clave = `${ambito.copropiedadId}:${ambito.viviendaId}`;
    const previas = this.creadas.get(clave) ?? [];
    // RN-17 · la misma clave devuelve la de antes, no una nueva.
    const repetida = previas.find((p) => p.nueva.claveDeIdempotencia === nueva.claveDeIdempotencia);
    if (repetida !== undefined) return { ok: true, id: repetida.id, repetida: true };

    /**
     * El contador es del DOBLE, no de la vivienda.
     *
     * Con `previas.length` la primera autorización de cada vivienda recibía el
     * mismo identificador, y entonces R1 nombrando el de su vecino encontraba
     * el suyo: la prueba del segundo eje pasaba sin demostrar nada. Un doble
     * que reparte identificadores ambiguos no es más simple, es menos capaz de
     * detectar el fallo que la prueba busca.
     */
    this.siguiente += 1;
    const id = `40000000-0000-4000-8000-${String(this.siguiente).padStart(12, '0')}`;
    this.creadas.set(clave, [...previas, { id, nueva }]);
    return { ok: true, id, repetida: false };
  }

  /**
   * El titular del dato biométrico: el visitante de ESA autorización, buscado
   * solo dentro del ámbito. El doble lo hace igual que el adaptador —filtrando
   * por `copropiedad:vivienda` antes de mirar el identificador— porque si
   * buscara en todas las viviendas, la prueba del segundo eje pasaría con un
   * adaptador roto.
   */
  async titularDeLaAutorizacion(
    ambito: AmbitoDelResidente,
    autorizacionId: string,
  ): Promise<{ readonly personaId: string; readonly nombre: string } | null> {
    const clave = `${ambito.copropiedadId}:${ambito.viviendaId}`;
    const suya = (this.creadas.get(clave) ?? []).find((a) => a.id === autorizacionId);
    if (suya === undefined) return null;
    return {
      // El titular es una persona DISTINTA del residente: es lo que RN-10
      // separa, y un doble que devolviera al residente haría pasar la prueba
      // que existe para impedirlo.
      personaId: `70000000-0000-4000-8000-${autorizacionId.slice(-12)}`,
      nombre: suya.nueva.visitante,
    };
  }
}

export class ZonasDelResidenteEnMemoria implements ZonasDelResidente {
  async zonas(ambito: AmbitoDelResidente, ahora: Date): Promise<readonly ZonaParaResidente[]> {
    // Las zonas son del CONJUNTO: no dependen de la vivienda, y por eso este
    // doble no las indexa por ella. Depender de ella aquí habría hecho pasar
    // una prueba que no dice nada.
    if (ambito.copropiedadId !== COP_A) return [];
    return [
      {
        id: '50000000-0000-4000-8000-000000000001',
        nombre: 'Piscina',
        aforoMaximo: 20,
        ocupacionActual: 17,
        abiertaAhora: true,
        franjasDeHoy: [
          {
            desde: new Date(ahora.getTime() - 3_600_000).toISOString(),
            hasta: ahora.toISOString(),
          },
        ],
        requiereAutorizacion: true,
      },
    ];
  }
}

export class NotificacionesDelResidenteEnMemoria implements NotificacionesDelResidente {
  readonly registrados: { copropiedadId: string; usuarioId: string; instalacionId: string }[] = [];

  async registrarToken(
    copropiedadId: string,
    usuarioId: string,
    aparato: {
      readonly instalacionId: string;
      readonly token: string;
      readonly plataforma: string;
    },
  ): Promise<{ readonly id: string }> {
    this.registrados.push({ copropiedadId, usuarioId, instalacionId: aparato.instalacionId });
    return { id: '60000000-0000-4000-8000-000000000001' };
  }
}

/** El registro de escrituras que la aplicación de pruebas está usando. */
export const registroDeEscrituras = (): AutorizacionesDelResidenteEnMemoria => {
  const r = AutorizacionesDelResidenteEnMemoria.ultima;
  if (r === undefined)
    throw new Error('la aplicación de pruebas no construyó el doble de escritura');
  return r;
};
