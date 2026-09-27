import { randomBytes } from 'node:crypto';
import { exito, fallo } from '@ncr/domain-core';
import type { Resultado } from '@ncr/domain-core';
import { nombreDeUsuario } from '../dominio/nombre-de-usuario';
import { correoSintetico } from '../dominio/correo-sintetico';
import { motivoDeRechazoDeContrasena } from '../dominio/politica-de-contrasena';
import type { AdministradorDeCuentas, RepositorioDeCuentas } from './puertos';

export interface SolicitudDeCuenta {
  readonly copropiedadId: string;
  /**
   * El del residente lo elige quien lo da de alta. El del PORTERO no existe
   * para nadie (H3, ADR-031): se genera aquí, sólo para derivar su correo
   * sintético, y el portero entra con su número.
   */
  readonly usuario?: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly rol: 'portero' | 'residente';
  readonly contrasenaInicial: string;
}

export type RechazoDeAlta =
  | { readonly motivo: 'FORMATO'; readonly detalle: string }
  | { readonly motivo: 'DUPLICADO' }
  | { readonly motivo: 'PROVEEDOR' }
  /** H2 · el cupo de porteros activos de la copropiedad está lleno. */
  | { readonly motivo: 'CUPO' }
  /** H2 · se dieron ya los 999 números del pool. */
  | { readonly motivo: 'POOL_AGOTADO' };

export interface CuentaCreadaEnBase {
  readonly usuarioId: string;
  /** H2 · el número del portero; `null` para un residente. */
  readonly numeroDePortero: number | null;
}

/** Un nombre interno que nadie teclea: letra y doce hexadecimales. */
export const generarUsuarioInterno = (): string => `p${randomBytes(6).toString('hex')}`;

/**
 * ALTA DE UNA CUENTA POR NOMBRE DE USUARIO (ADR-023).
 *
 * Dos sistemas y ninguna transacción que los abarque: primero el proveedor de
 * identidad, luego la base. Si la base falla, la cuenta del proveedor se
 * ELIMINA —compensación— para que no quede una identidad huérfana capaz de
 * pedir tokens. Al revés no hace falta: una fila en la base sin cuenta en el
 * proveedor no puede autenticarse.
 */
export class CrearCuentaPorUsuario {
  constructor(
    private readonly administrador: AdministradorDeCuentas,
    private readonly cuentas: RepositorioDeCuentas,
    private readonly generarUsuario: () => string = generarUsuarioInterno,
  ) {}

  async ejecutar(
    s: SolicitudDeCuenta,
    actorId: string,
  ): Promise<Resultado<CuentaCreadaEnBase, RechazoDeAlta>> {
    const usuario = nombreDeUsuario(
      s.rol === 'portero' ? (s.usuario ?? this.generarUsuario()) : (s.usuario ?? ''),
    );
    if (!usuario.ok) return fallo({ motivo: 'FORMATO', detalle: usuario.error });
    const politica = motivoDeRechazoDeContrasena(s.contrasenaInicial);
    if (politica !== null) return fallo({ motivo: 'FORMATO', detalle: politica });
    if (await this.cuentas.existeNombre(s.copropiedadId, usuario.valor)) {
      return fallo({ motivo: 'DUPLICADO' });
    }

    const creada = await this.administrador.crear(
      correoSintetico(usuario.valor, s.copropiedadId),
      s.contrasenaInicial,
    );
    if (!creada.ok) return fallo({ motivo: creada.motivo });

    let guardada;
    try {
      guardada = await this.cuentas.crearPorNombre(
        {
          authUserId: creada.authUserId,
          copropiedadId: s.copropiedadId,
          usuario: usuario.valor,
          nombre: s.nombre,
          telefono: s.telefono,
          rol: s.rol,
        },
        actorId,
      );
    } catch (error) {
      await this.administrador.eliminar(creada.authUserId);
      throw error;
    }
    if (!guardada.ok) {
      // Otra alta simultánea ganó el nombre, o el pool dijo que no: la base lo
      // decidió (ADR-04), y la cuenta del proveedor no queda huérfana.
      await this.administrador.eliminar(creada.authUserId);
      return fallo({ motivo: guardada.motivo });
    }
    return exito({ usuarioId: guardada.usuarioId, numeroDePortero: guardada.numeroDePortero });
  }
}
