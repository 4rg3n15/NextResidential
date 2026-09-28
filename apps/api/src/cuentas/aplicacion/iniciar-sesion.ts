import { exito, fallo } from '@ncr/domain-core';
import type { Resultado } from '@ncr/domain-core';
import { nombreDeUsuario } from '../dominio/nombre-de-usuario';
import { correoSintetico } from '../dominio/correo-sintetico';
import { codigoCorto } from '../../multiempresa/codigo-corto';
import { ROLES_CON_GANCHO_OBLIGATORIO } from './puertos';
import type {
  ControlDeIntentos,
  GanchosDeSesion,
  IgualadorDeTiempo,
  LectorDeToken,
  OrigenDeAcceso,
  ProveedorDeIdentidad,
  RepositorioDeCuentas,
  SesionEmitida,
} from './puertos';

/**
 * Cómo se identifica quien entra (ADR-031, que deroga ADR-023):
 *  · por su correo (administración, superadministrador, cuentas anteriores);
 *  · el RESIDENTE, por su usuario dentro de una copropiedad nombrada por su
 *    código corto (D1);
 *  · el PORTERO, sólo por su número (H3): el número dice la copropiedad.
 * El NIT ya no identifica a nadie en la entrada.
 */
export type IdentificadorDeAcceso =
  | { readonly tipo: 'correo'; readonly correo: string }
  | { readonly tipo: 'codigo'; readonly codigo: string; readonly usuario: string }
  | { readonly tipo: 'portero'; readonly numero: string };

/** H5 · la clave del contador de fallos: siempre con la forma normalizada. */
export const identificadorDeIntentos = (id: IdentificadorDeAcceso): string => {
  if (id.tipo === 'correo') return `correo:${id.correo.trim().toLowerCase()}`;
  if (id.tipo === 'portero') return `portero:${id.numero.trim()}`;
  const c = codigoCorto(id.codigo);
  return `codigo:${c.ok ? c.valor : id.codigo.trim()}|${id.usuario.trim().toLowerCase()}`;
};

export interface SesionConcedida extends SesionEmitida {
  readonly debeCambiarContrasena: boolean;
}

export type RechazoDeAcceso =
  /** Siempre el mismo texto: no dice si falló el código, el usuario o la contraseña. */
  | { readonly motivo: 'CREDENCIALES' }
  /** H5 · demasiados fallos de ESTE identificador desde ESTA IP: espera temporal. */
  | { readonly motivo: 'BLOQUEADO' }
  /** La contraseña era buena, pero la cuenta no tiene rol vigente. */
  | { readonly motivo: 'SIN_ACCESO' }
  /** La contraseña era buena, y otro módulo niega la sesión (el turno del portero). */
  | { readonly motivo: 'DENEGADO'; readonly detalle: string };

/**
 * Tiempo mínimo de un rechazo por credenciales (ADR-023, ADR-031). Sin él, «código
 * desconocido» respondería antes que «contraseña equivocada» —el primero no
 * llama al proveedor— y el cronómetro diría qué conjuntos existen.
 */
export const TIEMPO_MINIMO_DE_FALLO_MS = 400;

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * INICIAR SESIÓN · por correo, por código y usuario, o por número de portero
 * (ADR-031, que deroga ADR-023)
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
    private readonly intentos: ControlDeIntentos,
  ) {}

  async ejecutar(
    id: IdentificadorDeAcceso,
    contrasena: string,
    origen: OrigenDeAcceso,
  ): Promise<Resultado<SesionConcedida, RechazoDeAcceso>> {
    const inicio = this.tiempo.ahoraMs();
    const clave = identificadorDeIntentos(id);
    if (await this.intentos.bloqueado(origen.ip, clave)) return fallo({ motivo: 'BLOQUEADO' });
    const rechazar = async (): Promise<Resultado<SesionConcedida, RechazoDeAcceso>> => {
      await this.intentos.anotarFallo(origen.ip, clave, origen.agente);
      await this.tiempo.esperarHasta(inicio, TIEMPO_MINIMO_DE_FALLO_MS);
      return fallo({ motivo: 'CREDENCIALES' });
    };

    const correo = await this.correoDe(id);
    const sesion = correo === null ? null : await this.proveedor.iniciarSesion(correo, contrasena);
    if (sesion === null) return rechazar();

    const identidad = await this.lector.leer(sesion.accessToken);
    if (identidad === null) {
      await this.proveedor.cerrarSesion(sesion.accessToken);
      return fallo({ motivo: 'SIN_ACCESO' });
    }
    // H3 · el portero entra SÓLO por su número, y el número sólo lo usa él.
    if ((identidad.rol === 'portero') !== (id.tipo === 'portero')) {
      await this.proveedor.cerrarSesion(sesion.accessToken);
      return rechazar();
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

  /**
   * El código sólo dice EN QUÉ conjunto buscar, y el número del portero, a
   * quién. Uno inexistente responde igual que una contraseña equivocada —y
   * tarda lo mismo—: el mensaje no dice cuál de las piezas falló.
   */
  private async correoDe(id: IdentificadorDeAcceso): Promise<string | null> {
    if (id.tipo === 'correo') return id.correo.trim().toLowerCase();
    if (id.tipo === 'portero') {
      const numero = numeroDePortero(id.numero);
      const cuenta = numero === null ? null : await this.cuentas.cuentaDePortero(numero);
      if (cuenta === null) return null;
      return cuenta.acceso.tipo === 'correo'
        ? cuenta.acceso.correo.trim().toLowerCase()
        : correoSintetico(cuenta.acceso.usuario, cuenta.copropiedadId);
    }
    const u = nombreDeUsuario(id.usuario);
    const c = codigoCorto(id.codigo);
    if (!u.ok || !c.ok) return null;
    const copropiedadId = await this.cuentas.copropiedadPorCodigo(c.valor);
    return copropiedadId === null ? null : correoSintetico(u.valor, copropiedadId);
  }
}

/** Un número de portero: sólo dígitos, 1001 en adelante (ADR-031). */
export const numeroDePortero = (texto: string): number | null => {
  const t = texto.trim();
  if (!/^[0-9]{4,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1001 ? n : null;
};
