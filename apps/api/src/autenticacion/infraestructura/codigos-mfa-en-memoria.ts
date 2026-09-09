import { Injectable } from '@nestjs/common';
import type { RepositorioCodigosMfa } from '../aplicacion/puertos';

/**
 * Adaptador en memoria — **provisional y declarado como tal**, igual que los
 * del resto del monolito: este entorno no tiene contraseña de PostgreSQL
 * (D-17). `RepositorioCodigosMfaPg` cumple el mismo puerto contra la tabla
 * `codigos_recuperacion_mfa` de la migración 0026.
 *
 * Aquí importa decir lo que NO garantiza: al reiniciar el proceso los códigos
 * desaparecen. En producción eso equivaldría a dejar a la gente sin salida ante
 * un teléfono perdido, así que el adaptador PostgreSQL no es opcional el día
 * que la API conecte a la base.
 */
@Injectable()
export class RepositorioCodigosMfaEnMemoria implements RepositorioCodigosMfa {
  private readonly porUsuario = new Map<string, Set<string>>();

  async reemplazar(usuarioId: string, hashes: readonly string[]): Promise<void> {
    this.porUsuario.set(usuarioId, new Set(hashes));
  }

  async hashesVigentes(usuarioId: string): Promise<readonly string[]> {
    return [...(this.porUsuario.get(usuarioId) ?? [])];
  }

  async consumir(usuarioId: string, hash: string): Promise<boolean> {
    const vigentes = this.porUsuario.get(usuarioId);
    // `delete` devuelve si estaba: la decisión de «un solo uso» la toma la
    // estructura en una sola operación, no una lectura seguida de una escritura.
    return vigentes?.delete(hash) === true;
  }
}
