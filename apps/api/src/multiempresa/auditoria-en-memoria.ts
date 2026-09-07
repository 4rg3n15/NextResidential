import { Injectable } from '@nestjs/common';
import type { RegistroDeAuditoria } from './aislamiento';

/**
 * Adaptador transitorio de `auditoria_seguridad`.
 *
 * La tabla existe desde la ETAPA 01, pero la API todavía NO abre conexión a
 * PostgreSQL en ejecución (deuda D-17). Este adaptador conserva los registros
 * en memoria para que la suite de aislamiento pueda comprobar que **cada**
 * acceso cruzado deja rastro — que es la parte de CA-24 verificable hoy—, y
 * deja el puerto listo para el adaptador real.
 */
@Injectable()
export class AuditoriaEnMemoria implements RegistroDeAuditoria {
  readonly registros: {
    usuarioId: string;
    rol: string;
    copropiedadSolicitada: string;
    recurso: string;
  }[] = [];

  async registrarAccesoCruzado(entrada: {
    usuarioId: string;
    rol: string;
    copropiedadSolicitada: string;
    recurso: string;
  }): Promise<void> {
    this.registros.push(entrada);
  }
}
