/**
 * Puerto del directorio del residente — la superficie que la app móvil lee.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN PUERTO NUEVO Y NO TRES MÉTODOS MÁS EN `RepositorioPadron`
 *
 * §2.3 (ISP) y la frontera de §2.2. `RepositorioPadron` responde preguntas de
 * administración —listar el conjunto entero, generar, exportar, desactivar— y
 * todas reciben `copropiedadId` porque ese es su ámbito. Las de aquí reciben
 * **el ámbito del residente**, que es una vivienda, y ninguna admite que el
 * llamante nombre otra. Mezclarlas dejaría en un mismo puerto dos operaciones
 * cuyo alcance se parece lo suficiente para confundirse en una revisión: es
 * exactamente el error que se quiere imposibilitar.
 *
 * Además obliga a lo que importa: aquí **no hay un solo método que reciba un
 * `viviendaId` desde fuera**. El vínculo se resuelve con `vinculoDe`, a partir
 * de la identidad, y el resto recibe el ámbito ya construido por el dominio.
 */
import type { AmbitoDelResidente } from '@ncr/domain-core';

export const DIRECTORIO_DEL_RESIDENTE = Symbol('DIRECTORIO_DEL_RESIDENTE');

/** El vínculo activo entre una identidad y su vivienda. */
export interface VinculoDeResidente {
  readonly copropiedadId: string;
  readonly viviendaId: string;
  readonly residenteId: string;
  readonly personaId: string;
  readonly esTitular: boolean;
  /** `[SUPUESTO]` P-11: por defecto el más restrictivo (`SoloIngreso`). */
  readonly nivelAcceso: string | null;
}

export interface ViviendaDelResidente {
  readonly id: string;
  readonly identificador: string;
  readonly agrupacion: string | null;
  /** Cómo llama ESTA copropiedad a sus viviendas y a sus agrupaciones (0029). */
  readonly etiquetaVivienda: string;
  readonly etiquetaAgrupacion: string;
  readonly direccion: string | null;
  readonly copropiedadNombre: string;
  /** Alimentado externamente; Next Control no calcula cartera (S-01). */
  readonly estadoAdministrativo: string;
  /** RN-13: una vivienda inactiva conserva lo vigente y no genera nuevo. */
  readonly activa: boolean;
}

export interface MiembroDeFamilia {
  readonly residenteId: string;
  readonly nombre: string;
  readonly parentesco: string | null;
  readonly esTitular: boolean;
  readonly nivelAcceso: string | null;
  readonly activo: boolean;
}

export interface VehiculoDelResidente {
  readonly id: string;
  readonly placa: string;
  readonly marca: string | null;
  readonly modelo: string | null;
  readonly color: string | null;
  readonly esPrincipal: boolean;
  readonly activo: boolean;
}

export interface AutorizacionDelResidente {
  readonly id: string;
  readonly visitante: string;
  readonly tipo: string;
  readonly desde: string;
  readonly hasta: string;
  readonly placa: string | null;
  readonly permiteAccesoVehicular: boolean;
  readonly estado: string;
  readonly acompanantes: number;
}

export interface EventoDelResidente {
  readonly id: string;
  readonly ocurridoEn: string;
  readonly tipo: string;
  readonly resultado: string | null;
  /** El residente tiene derecho a entender la negación (mockup M-6). */
  readonly motivo: string | null;
  readonly metodo: string;
  readonly placaDetectada: string | null;
  readonly persona: string | null;
  readonly zona: string | null;
  readonly decididoPorEdge: boolean;
}

export interface FiltroDeHistorial {
  /** `hoy` · `semana` · `mes` · `todo`, como los chips del mockup M-6. */
  readonly periodo: 'hoy' | 'semana' | 'mes' | 'todo';
  readonly limite: number;
}

/**
 * Todas las lecturas de la app del residente.
 *
 * Ni un método recibe `viviendaId` como argumento del cliente: reciben el
 * `AmbitoDelResidente` que `ambitoDelResidente()` construyó desde el vínculo.
 * Un adaptador no puede, por tanto, ser llamado con la vivienda del vecino sin
 * que el ámbito lo diga — y el ámbito no sale de la petición.
 */
export interface DirectorioDelResidente {
  /** Resuelve identidad → vivienda. Es el único punto donde nace el ámbito. */
  vinculoDe(usuarioId: string): Promise<VinculoDeResidente | null>;
  vivienda(ambito: AmbitoDelResidente): Promise<ViviendaDelResidente | null>;
  familia(ambito: AmbitoDelResidente): Promise<readonly MiembroDeFamilia[]>;
  vehiculos(ambito: AmbitoDelResidente): Promise<readonly VehiculoDelResidente[]>;
  autorizaciones(ambito: AmbitoDelResidente): Promise<readonly AutorizacionDelResidente[]>;
  historial(
    ambito: AmbitoDelResidente,
    filtro: FiltroDeHistorial,
  ): Promise<readonly EventoDelResidente[]>;
}
