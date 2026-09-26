import { exito, fallo } from '@ncr/domain-core';
import type { Resultado } from '@ncr/domain-core';
import { nombreDeUsuario } from '../dominio/nombre-de-usuario';
import { correoSintetico } from '../dominio/correo-sintetico';
import { motivoDeRechazoDeContrasena } from '../dominio/politica-de-contrasena';
import type { AdministradorDeCuentas, RepositorioDeCuentas } from './puertos';

export interface SolicitudDeCuenta {
  readonly copropiedadId: string;
  readonly usuario: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly rol: 'portero' | 'residente';
  readonly contrasenaInicial: string;
}

export type RechazoDeAlta =
  | { readonly motivo: 'FORMATO'; readonly detalle: string }
  | { readonly motivo: 'DUPLICADO' }
  | { readonly motivo: 'PROVEEDOR' };

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
  ) {}

  async ejecutar(
    s: SolicitudDeCuenta,
    actorId: string,
  ): Promise<Resultado<{ readonly usuarioId: string }, RechazoDeAlta>> {
    const usuario = nombreDeUsuario(s.usuario);
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

    let usuarioId: string | null;
    try {
      usuarioId = await this.cuentas.crearPorNombre(
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
    if (usuarioId === null) {
      // Otra alta simultánea ganó el nombre: la base lo decidió (ADR-04).
      await this.administrador.eliminar(creada.authUserId);
      return fallo({ motivo: 'DUPLICADO' });
    }
    return exito({ usuarioId });
  }
}
