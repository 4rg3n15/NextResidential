import { exito, fallo } from '@ncr/domain-core';
import type { Resultado } from '@ncr/domain-core';
import { nit, nombreDeUsuario } from '../dominio/nombre-de-usuario';
import { correoSintetico } from '../dominio/correo-sintetico';
import { codigoCorto } from '../../multiempresa/codigo-corto';
import { ROLES_CON_GANCHO_OBLIGATORIO } from './puertos';
import type {
  GanchosDeSesion,
  IgualadorDeTiempo,
  LectorDeToken,
  OrigenDeAcceso,
  ProveedorDeIdentidad,
  RepositorioDeCuentas,
  SesionEmitida,
} from './puertos';

/**
 * Cómo se identifica quien entra: por su correo (cuentas anteriores a la 15-H)
 * o por su usuario DENTRO de una copropiedad, que se nombra por su código corto
 * (D1, la app y la consola) o por su NIT (sólo la consola, C-34).
 */
export type IdentificadorDeAcceso =
  | { readonly tipo: 'correo'; readonly correo: string }
  | { readonly tipo: 'usuario'; readonly nit: string; readonly usuario: string }
  | { readonly tipo: 'codigo'; readonly codigo: string; readonly usuario: string };

export interface SesionConcedida extends SesionEmitida {
  readonly debeCambiarContrasena: boolean;
}

export type RechazoDeAcceso =
  /** Siempre el mismo texto: no dice si falló el NIT, el usuario o la contraseña. */
  | { readonly motivo: 'CREDENCIALES' }
  /** La contraseña era buena, pero la cuenta no tiene rol vigente. */
  | { readonly motivo: 'SIN_ACCESO' }
  /** La contraseña era buena, y otro módulo niega la sesión (el turno del portero). */
  | { readonly motivo: 'DENEGADO'; readonly detalle: string };

/**
 * Tiempo mínimo de un rechazo por credenciales (ADR-023). Sin él, «NIT
 * desconocido» respondería antes que «contraseña equivocada» —el primero no
 * llama al proveedor— y el cronómetro diría qué conjuntos existen.
 */
export const TIEMPO_MINIMO_DE_FALLO_MS = 400;

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * INICIAR SESIÓN · por correo o por NIT y usuario (ADR-023)
 *
 * Toda entrada de la consola pasa por aquí, las dos formas, y por eso aquí se
 * imponen las tres cosas que la consola sola no podía imponer: el límite de
 * intentos por cuenta (en la ruta), el tiempo uniforme de los fallos y el
 * gancho de sesión del rol —el turno del portero—.
 *
 * El correo sintético se calcula aquí y muere aquí: viaja al proveedor y no
 * vuelve en ningún valor de retorno.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class IniciarSesion {
  constructor(
    private readonly proveedor: ProveedorDeIdentidad,
    private readonly cuentas: RepositorioDeCuentas,
    private readonly lector: LectorDeToken,
    private readonly ganchos: GanchosDeSesion,
    private readonly tiempo: IgualadorDeTiempo,
  ) {}

  async ejecutar(
    id: IdentificadorDeAcceso,
    contrasena: string,
    origen: OrigenDeAcceso,
  ): Promise<Resultado<SesionConcedida, RechazoDeAcceso>> {
    const inicio = this.tiempo.ahoraMs();
    const correo = await this.correoDe(id);
    const sesion = correo === null ? null : await this.proveedor.iniciarSesion(correo, contrasena);
    if (sesion === null) {
      await this.tiempo.esperarHasta(inicio, TIEMPO_MINIMO_DE_FALLO_MS);
      return fallo({ motivo: 'CREDENCIALES' });
    }

    const identidad = await this.lector.leer(sesion.accessToken);
    if (identidad === null) {
      await this.proveedor.cerrarSesion(sesion.accessToken);
      return fallo({ motivo: 'SIN_ACCESO' });
    }

    const gancho = this.ganchos.de(identidad.rol);
    if (gancho === undefined && ROLES_CON_GANCHO_OBLIGATORIO.includes(identidad.rol)) {
      await this.proveedor.cerrarSesion(sesion.accessToken);
      return fallo({ motivo: 'DENEGADO', detalle: 'El acceso de este rol no está disponible' });
    }
    if (gancho !== undefined) {
      const veredicto =
        identidad.copropiedadId === null || identidad.sesionId === null
          ? ({ permitido: false, motivo: 'La sesión no se puede registrar' } as const)
          : await gancho.alIniciar({
              usuarioId: identidad.usuarioId,
              copropiedadId: identidad.copropiedadId,
              sesionId: identidad.sesionId,
              origen,
            });
      if (!veredicto.permitido) {
        await this.proveedor.cerrarSesion(sesion.accessToken);
        return fallo({ motivo: 'DENEGADO', detalle: veredicto.motivo });
      }
    }

    return exito({ ...sesion, debeCambiarContrasena: identidad.debeCambiarContrasena });
  }

  private async correoDe(id: IdentificadorDeAcceso): Promise<string | null> {
    if (id.tipo === 'correo') return id.correo.trim().toLowerCase();
    const u = nombreDeUsuario(id.usuario);
    if (!u.ok) return null;
    const copropiedadId = await this.copropiedadDe(id);
    return copropiedadId === null ? null : correoSintetico(u.valor, copropiedadId);
  }

  /**
   * El código o el NIT sólo dicen EN QUÉ conjunto buscar. Uno inexistente
   * responde igual que una contraseña equivocada —y tarda lo mismo—: el
   * mensaje no dice cuál de las tres piezas falló.
   */
  private async copropiedadDe(
    id: Exclude<IdentificadorDeAcceso, { readonly tipo: 'correo' }>,
  ): Promise<string | null> {
    if (id.tipo === 'codigo') {
      const c = codigoCorto(id.codigo);
      return c.ok ? this.cuentas.copropiedadPorCodigo(c.valor) : null;
    }
    const n = nit(id.nit);
    return n.ok ? this.cuentas.copropiedadPorNit(n.valor) : null;
  }
}
