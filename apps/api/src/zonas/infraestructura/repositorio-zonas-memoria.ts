import { Zona, esFallo } from '@ncr/domain-core';
import type {
  PresentacionDeZona,
  RepositorioAutorizacionesZona,
  RepositorioZonas,
  ResultadoOcupacion,
} from '../aplicacion/puertos';

/**
 * Adaptador en memoria — **provisional y declarado como tal** (D-25).
 *
 * Reproduce la SEMÁNTICA del incremento atómico, pero no la garantía: en un
 * proceso de un solo hilo no hay dos peticiones a la vez, así que este doble no
 * puede demostrar nada sobre concurrencia. Quien lo demuestra es
 * `test/aforo-concurrencia.test.ts` contra PostgreSQL — y el `CHECK` de la
 * migración 0007, que impide la violación aunque el código la intente.
 *
 * Escribirlo igualmente sirve para dos cosas: que la API arranque sin
 * credencial, y que la suite de contrato pase con los dos adaptadores sin
 * cambiar una aserción (LSP, §2.3).
 */
export class RepositorioZonasEnMemoria implements RepositorioZonas {
  private readonly zonas = new Map<string, Zona>();
  private readonly permisos = new Map<string, Set<string>>();
  private readonly iconos = new Map<string, string | null>();

  private clave(copropiedadId: string, zonaId: string): string {
    return `${copropiedadId}|${zonaId}`;
  }

  async porId(copropiedadId: string, zonaId: string): Promise<Zona | null> {
    return this.zonas.get(this.clave(copropiedadId, zonaId)) ?? null;
  }

  async listar(copropiedadId: string): Promise<readonly Zona[]> {
    return [...this.zonas.values()].filter((z) => z.copropiedadId === copropiedadId);
  }

  async guardar(zona: Zona, _actorId: string): Promise<void> {
    this.zonas.set(this.clave(zona.copropiedadId, zona.id), zona);
  }

  async ocupar(copropiedadId: string, zonaId: string): Promise<ResultadoOcupacion> {
    const zona = this.zonas.get(this.clave(copropiedadId, zonaId));
    if (zona === undefined) return { tipo: 'zona_no_encontrada' };

    const ocupado = zona.aforo.ocupar();
    if (esFallo(ocupado)) return { tipo: 'aforo_superado', conteo: zona.aforo.actual };

    const actualizada = zona.reconfigurar({ aforo: ocupado.valor });
    if (esFallo(actualizada)) return { tipo: 'aforo_superado', conteo: zona.aforo.actual };
    this.zonas.set(this.clave(copropiedadId, zonaId), actualizada.valor);
    return { tipo: 'ocupado', conteo: ocupado.valor.actual };
  }

  async liberar(copropiedadId: string, zonaId: string): Promise<number> {
    const zona = this.zonas.get(this.clave(copropiedadId, zonaId));
    if (zona === undefined) return 0;

    const liberado = zona.aforo.liberar();
    const actualizada = zona.reconfigurar({ aforo: liberado });
    if (esFallo(actualizada)) return zona.aforo.actual;
    this.zonas.set(this.clave(copropiedadId, zonaId), actualizada.valor);
    return liberado.actual;
  }

  async reiniciar(copropiedadId: string, zonaId: string, ahora: Date): Promise<void> {
    const zona = this.zonas.get(this.clave(copropiedadId, zonaId));
    if (zona === undefined) return;
    // `conAforoAlDia` sella el instante del reinicio, igual que la columna
    // `reiniciado_en` de la base.
    this.zonas.set(this.clave(copropiedadId, zonaId), zona.conAforoAlDia(ahora));
  }

  async desactivar(
    copropiedadId: string,
    zonaId: string,
    _motivo: string,
    _actorId: string,
  ): Promise<boolean> {
    const zona = this.zonas.get(this.clave(copropiedadId, zonaId));
    if (zona === undefined || !zona.activa) return false;
    const inactiva = Zona.crear({
      id: zona.id,
      copropiedadId: zona.copropiedadId,
      nombre: zona.nombre,
      tipo: zona.tipo,
      horario: zona.horario,
      aforo: zona.aforo,
      politicaReinicio: zona.politicaReinicio,
      normas: zona.normas,
      controladores: zona.controladores,
      abierta: false,
      ultimoReinicio: zona.ultimoReinicio,
      activa: false,
    });
    if (esFallo(inactiva)) return false;
    this.zonas.set(this.clave(copropiedadId, zonaId), inactiva.valor);
    return true;
  }

  async presentacionDe(copropiedadId: string): Promise<ReadonlyMap<string, PresentacionDeZona>> {
    return new Map(
      [...this.iconos.entries()]
        .filter(([clave]) => clave.startsWith(`${copropiedadId}|`))
        .map(([clave, icono]) => [clave.split('|')[1] ?? '', { icono }]),
    );
  }

  async fijarIcono(
    copropiedadId: string,
    zonaId: string,
    icono: string | null,
    _actorId: string,
  ): Promise<void> {
    this.iconos.set(this.clave(copropiedadId, zonaId), icono);
  }

  /** Alta directa, solo para pruebas y para la semilla del arranque. */
  declarar(zona: Zona): void {
    this.zonas.set(this.clave(zona.copropiedadId, zona.id), zona);
  }

  get permisosDeZona(): RepositorioAutorizacionesZona {
    return {
      autorizar: async (copropiedadId, autorizacionId, zonaId) => {
        const clave = `${copropiedadId}|${autorizacionId}`;
        const zonas = this.permisos.get(clave) ?? new Set<string>();
        const nuevo = !zonas.has(zonaId);
        zonas.add(zonaId);
        this.permisos.set(clave, zonas);
        return nuevo;
      },
      zonasDe: async (copropiedadId, autorizacionId) => [
        ...(this.permisos.get(`${copropiedadId}|${autorizacionId}`) ?? []),
      ],
    };
  }
}
