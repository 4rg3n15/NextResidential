import type { ContextoTenant } from '../autenticacion';
import type { CambiosDeConfiguracion, ConfiguracionDeCopropiedad } from './configuracion';
import { cambiosEfectivos } from './configuracion';

/**
 * Puerto de lectura del catálogo de copropiedades.
 *
 * Existe por un defecto de la ETAPA 09 que dejó inutilizable al único rol capaz
 * de administrarlo todo: **el superadministrador no tiene copropiedad**. Su
 * `copropiedad_id` es nulo por diseño —el gancho de claims lo escribe así a
 * propósito y su alcance real lo resuelve `app.es_superadmin()`— y la consola
 * interpretaba ese nulo como «sin permiso» en vez de como «ve todas». Sin una
 * forma de ENUMERAR las copropiedades, ni siquiera había cómo ofrecerle elegir.
 *
 * `listar` devuelve **exactamente el alcance del llamante**, y la filtra dos
 * veces a propósito (§2.7.6): la RLS en la base y el contexto aquí. No es
 * redundancia — la llave secreta omite la RLS, así que el filtro de aplicación
 * es la única barrera en las rutas que la usan.
 */
export const REPOSITORIO_COPROPIEDADES = Symbol.for('ncr.puerto.RepositorioCopropiedades');

export interface CopropiedadResumen {
  readonly id: string;
  readonly nombre: string;
  readonly zonaHoraria: string;
}

export interface RepositorioCopropiedades {
  listarParaElAlcance(ctx: ContextoTenant): Promise<readonly CopropiedadResumen[]>;

  /** `null` si el token no alcanza esa copropiedad: la consola lo traduce a 404. */
  leerConfiguracion(ctx: ContextoTenant, id: string): Promise<ConfiguracionDeCopropiedad | null>;

  /**
   * Guarda los cambios **y su registro de auditoría en la misma transacción**.
   *
   * Van juntos a propósito. Si el registro se escribiera después, una caída
   * entre las dos operaciones dejaría un cambio de configuración sin rastro, y
   * §2.7.8 exige que no exista esa ventana: la auditoría no es un `console.log`
   * de cortesía, es la constancia de quién tocó qué.
   *
   * Devuelve la configuración ya guardada, o `null` si la copropiedad quedó
   * fuera del alcance del token.
   */
  guardarConfiguracion(
    ctx: ContextoTenant,
    id: string,
    cambios: CambiosDeConfiguracion,
  ): Promise<ConfiguracionDeCopropiedad | null>;
}

/**
 * Alcance de una identidad sobre el catálogo, como función pura.
 *
 * Se escribe aparte del adaptador para poder probarla sin base de datos y para
 * que el adaptador de PostgreSQL y el doble no puedan discrepar: los dos la
 * usan. Es la misma decisión que `alcanzaCopropiedad`, extendida de «¿alcanzo
 * ESTA?» a «¿cuáles alcanzo?».
 */
export const filtrarPorAlcance = (
  ctx: ContextoTenant,
  todas: readonly CopropiedadResumen[],
): readonly CopropiedadResumen[] => {
  // El superadministrador las ve todas. Es la razón de ser de este fichero.
  if (ctx.rol === 'superadministrador') return todas;
  // El operador de central ve las de su turno activo (S-10, KPI-35).
  if (ctx.rol === 'operador_central') {
    const suyas = new Set(ctx.copropiedadesAtendidas);
    return todas.filter((c) => suyas.has(c.id));
  }
  // Los demás, la suya y nada más. Sin copropiedad en el token, ninguna: un
  // arreglo vacío es la respuesta correcta, no un error.
  return ctx.copropiedadId === null ? [] : todas.filter((c) => c.id === ctx.copropiedadId);
};

/**
 * Doble en memoria. Provisional por D-17 —sin contraseña de PostgreSQL la API
 * no se conecta en las pruebas— y declarado incapaz de demostrar la RLS: eso se
 * prueba contra base real en `test/copropiedades-pg.test.ts`.
 */
export class RepositorioCopropiedadesEnMemoria implements RepositorioCopropiedades {
  private filas: readonly CopropiedadResumen[] = [];
  private configuraciones = new Map<string, ConfiguracionDeCopropiedad>();

  /** Lo que el doble anotó en `auditoria_seguridad`, para que la suite lo mire. */
  readonly auditoria: {
    copropiedadId: string;
    usuarioId: string;
    rol: string;
    resumen: string;
  }[] = [];

  declarar(filas: readonly CopropiedadResumen[]): void {
    this.filas = filas;
    for (const fila of filas) {
      if (!this.configuraciones.has(fila.id)) {
        this.configuraciones.set(fila.id, {
          nombre: fila.nombre,
          zonaHoraria: fila.zonaHoraria,
          umbralConfianzaPlaca: 0.85,
          politicaContingenciaEdge: 'denegar',
          umbralLatidoMinutos: 5,
          nit: '900000000',
          estado: 'activa',
          plazoConsentimientoHoras: 24,
          margenCacheReglasHoras: 24,
          versionReglasActual: 0,
        });
      }
    }
  }

  async listarParaElAlcance(ctx: ContextoTenant): Promise<readonly CopropiedadResumen[]> {
    return filtrarPorAlcance(ctx, this.filas);
  }

  private alcanza(ctx: ContextoTenant, id: string): boolean {
    return filtrarPorAlcance(ctx, this.filas).some((c) => c.id === id);
  }

  async leerConfiguracion(
    ctx: ContextoTenant,
    id: string,
  ): Promise<ConfiguracionDeCopropiedad | null> {
    if (!this.alcanza(ctx, id)) return null;
    return this.configuraciones.get(id) ?? null;
  }

  async guardarConfiguracion(
    ctx: ContextoTenant,
    id: string,
    cambios: CambiosDeConfiguracion,
  ): Promise<ConfiguracionDeCopropiedad | null> {
    if (!this.alcanza(ctx, id)) return null;
    const actual = this.configuraciones.get(id);
    if (actual === undefined) return null;
    const efectivos = cambiosEfectivos(actual, cambios);
    const guardada: ConfiguracionDeCopropiedad = { ...actual, ...efectivos };
    this.configuraciones.set(id, guardada);
    this.filas = this.filas.map((f) =>
      f.id === id ? { ...f, nombre: guardada.nombre, zonaHoraria: guardada.zonaHoraria } : f,
    );
    if (Object.keys(efectivos).length > 0) {
      this.auditoria.push({
        copropiedadId: id,
        usuarioId: ctx.usuarioId,
        rol: ctx.rol,
        resumen: Object.keys(efectivos).join(','),
      });
    }
    return guardada;
  }
}
