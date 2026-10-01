import { randomUUID } from 'node:crypto';
import type { SalidaAplanada } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import type { PuntoDeAcceso, RepositorioDePuntos } from '../aplicacion/puntos-de-acceso';

interface Guardado extends PuntoDeAcceso {
  readonly copropiedadId: string;
  readonly activo: boolean;
}

/**
 * 15-P · el doble de la suite y del modo sin base: el mismo contrato que
 * `RepositorioDePuntosPg` —baja lógica, nombre que sobrevive a otra lectura,
 * una puerta activa por equipo— para que lo que se pruebe sin base sea lo que
 * la base hace.
 */
export class RepositorioDePuntosEnMemoria implements RepositorioDePuntos {
  private filas: Guardado[] = [];

  private activos(copropiedadId: string, dispositivoId: string): readonly PuntoDeAcceso[] {
    return this.filas
      .filter(
        (f) => f.activo && f.copropiedadId === copropiedadId && f.dispositivoId === dispositivoId,
      )
      .sort((a, b) => a.numeroDePuerta - b.numeroDePuerta)
      .map(({ copropiedadId: _c, activo: _a, ...punto }) => punto);
  }

  async listar(
    _ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<readonly PuntoDeAcceso[]> {
    return this.activos(copropiedadId, dispositivoId);
  }

  async sincronizar(
    _ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    salidas: readonly SalidaAplanada[],
    ahora: Date,
  ): Promise<readonly PuntoDeAcceso[]> {
    const declaradas = new Map(salidas.map((s) => [s.numeroDePuerta, s]));
    const delEquipo = (f: Guardado) =>
      f.activo && f.copropiedadId === copropiedadId && f.dispositivoId === dispositivoId;
    this.filas = this.filas.map((f) => {
      if (!delEquipo(f)) return f;
      const s = declaradas.get(f.numeroDePuerta);
      if (s === undefined) return f.origen === 'descubierto' ? { ...f, activo: false } : f;
      declaradas.delete(f.numeroDePuerta);
      return { ...f, modulo: s.modulo, rutaEnElEquipo: s.ruta, descubiertoEn: ahora };
    });
    for (const s of declaradas.values()) {
      this.filas.push({
        id: randomUUID(),
        copropiedadId,
        dispositivoId,
        nombre: s.nombre,
        numeroDePuerta: s.numeroDePuerta,
        modulo: s.modulo,
        rutaEnElEquipo: s.ruta,
        origen: 'descubierto',
        descubiertoEn: ahora,
        activo: true,
      });
    }
    return this.activos(copropiedadId, dispositivoId);
  }

  async renombrar(
    _ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    puntoId: string,
    nombre: string,
  ): Promise<PuntoDeAcceso | null> {
    const i = this.filas.findIndex(
      (f) =>
        f.id === puntoId &&
        f.activo &&
        f.copropiedadId === copropiedadId &&
        f.dispositivoId === dispositivoId,
    );
    const fila = this.filas[i];
    if (fila === undefined) return null;
    this.filas[i] = { ...fila, nombre };
    return this.activos(copropiedadId, dispositivoId).find((p) => p.id === puntoId) ?? null;
  }
}
