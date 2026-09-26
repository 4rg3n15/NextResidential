import type { Rol } from '../../autenticacion';
import type { GanchoDeSesion, GanchosDeSesion } from './puertos';

/** Registro en proceso. Un rol, un gancho: inscribir dos veces es un error de cableado. */
export class RegistroDeGanchosDeSesion implements GanchosDeSesion {
  private readonly ganchos = new Map<Rol, GanchoDeSesion>();

  inscribir(rol: Rol, gancho: GanchoDeSesion): void {
    if (this.ganchos.has(rol)) {
      throw new Error(`gancho de sesión duplicado para el rol ${rol}`);
    }
    this.ganchos.set(rol, gancho);
  }

  de(rol: Rol): GanchoDeSesion | undefined {
    return this.ganchos.get(rol);
  }
}
