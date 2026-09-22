import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CatalogoDeCopropiedades } from '../aplicacion/puertos';

/**
 * Las copropiedades ACTIVAS, y solo sus identificadores.
 *
 * Una copropiedad desactivada no se barre: RN-19 dice que no hay borrado
 * físico, así que sigue ahí con su historial, pero no es un tenant en
 * operación. Barrerla abriría alertas de dispositivos que ya nadie atiende.
 */
@Injectable()
export class CatalogoDeCopropiedadesPg implements CatalogoDeCopropiedades {
  constructor(private readonly pool: Pool) {}

  async activas(): Promise<readonly string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.copropiedades WHERE estado = 'activa' ORDER BY id`,
    );
    return rows.map((r) => r.id);
  }
}

/** Doble para la suite y para cualquier banco sin base. */
export class CatalogoDeCopropiedadesEnMemoria implements CatalogoDeCopropiedades {
  constructor(private ids: readonly string[] = []) {}
  declarar(ids: readonly string[]): void {
    this.ids = ids;
  }
  async activas(): Promise<readonly string[]> {
    return this.ids;
  }
}
