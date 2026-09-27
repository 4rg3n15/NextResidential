import type { CapacidadesDeEquipo } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import type { RepositorioDeEquipos } from './puertos';

/**
 * A3 (ETAPA 15-E) · «a TODAS las terminales y videoporteros con biblioteca de
 * rostros». Es una pregunta por CAPACIDAD, no por tipo ni por marca (ADR-019):
 * un videoportero que declara `bibliotecaDeRostros: si` recibe la plantilla
 * igual que una terminal, y una terminal cuyo sondeo no la declaró, no. El
 * que no lo declaró aparece en su ficha con la capacidad `desconocida` y el
 * remedio es sondearlo, no suponer.
 *
 * Sale por el barril como TOKEN: el módulo de biometría declara su propia
 * interfaz (`CatalogoDeTerminales`) y ésta la satisface por forma (§2.2).
 */
export const TERMINALES_DE_ROSTROS = Symbol.for('ncr.equipos.TerminalesDeRostros');

export interface TerminalDeRostros {
  readonly dispositivoId: string;
  readonly nombre: string;
}

/**
 * A3 (15-L) · una terminal o un videoportero que la sincronización OMITE, con
 * el porqué: que no admite rostros es un hecho del modelo; que no se sabe se
 * resuelve sondeándolo. Ninguno de los dos es un fallo silencioso.
 */
export interface EquipoSinRostros {
  readonly dispositivoId: string;
  readonly nombre: string;
  readonly motivo: 'no_admite' | 'sin_comprobar';
}

/**
 * `true` sólo con `si`; `desconocida` cuenta como no (la dirección segura).
 * Se escribe aquí y no se importa de `@ncr/providers` porque la capa de
 * aplicación sólo conoce el paquete por sus TIPOS (O2): un valor importado
 * de ahí sería la primera hebra de un acoplamiento a un fabricante.
 */
const conBiblioteca = (capacidades: CapacidadesDeEquipo | null): boolean =>
  capacidades !== null && capacidades.bibliotecaDeRostros.estado === 'si';

export class TerminalesDeRostrosDesdeRegistro {
  constructor(private readonly equipos: RepositorioDeEquipos) {}

  async conBibliotecaDeRostros(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<readonly TerminalDeRostros[]> {
    const equipos = await this.equipos.listar(ctx, copropiedadId);
    return equipos
      .filter((e) => e.estado === 'activo' && conBiblioteca(e.capacidades))
      .map((e) => ({ dispositivoId: e.id, nombre: e.nombre }));
  }

  /** A3 (15-L) · las terminales y videoporteros activos que se quedan fuera. */
  async sinBibliotecaDeRostros(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<readonly EquipoSinRostros[]> {
    const equipos = await this.equipos.listar(ctx, copropiedadId);
    return equipos
      .filter(
        (e) =>
          e.estado === 'activo' &&
          (e.tipo === 'terminal_facial' || e.tipo === 'intercom') &&
          !conBiblioteca(e.capacidades),
      )
      .map((e) => ({
        dispositivoId: e.id,
        nombre: e.nombre,
        motivo: e.capacidades?.bibliotecaDeRostros.estado === 'no' ? 'no_admite' : 'sin_comprobar',
      }));
  }
}
