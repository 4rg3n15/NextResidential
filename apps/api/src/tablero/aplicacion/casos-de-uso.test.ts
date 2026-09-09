import { beforeEach, describe, expect, it } from 'vitest';
import { UMBRAL_DE_LATIDO_POR_DEFECTO } from '@ncr/domain-core';
import type { Reloj, VentanaDelDia } from '@ncr/domain-core';
import {
  ConsultarAccesosPorHora,
  ConsultarDispositivos,
  ConsultarIndicadores,
  CopropiedadDesconocida,
} from './casos-de-uso';
import type {
  ConfiguracionDeTablero,
  ConteosDeAlertas,
  ConteosDelPadron,
  ConteosDeVisitantes,
  DispositivoDelTablero,
  FranjaDeAccesos,
  RepositorioTablero,
} from './puertos';

const COP = '11111111-1111-4111-8111-111111111111';

class RepositorioDoble implements RepositorioTablero {
  config: ConfiguracionDeTablero | null = {
    copropiedadId: COP,
    zonaHoraria: 'America/Bogota',
    umbralDeLatido: UMBRAL_DE_LATIDO_POR_DEFECTO,
  };
  ventanasRecibidas: VentanaDelDia[] = [];
  franjas: FranjaDeAccesos[] = [];
  equipos: DispositivoDelTablero[] = [];

  async configuracion(): Promise<ConfiguracionDeTablero | null> {
    return this.config;
  }
  async conteosDelPadron(_c: string, v: VentanaDelDia): Promise<ConteosDelPadron> {
    this.ventanasRecibidas.push(v);
    return {
      residentesActivos: 247,
      residentesAltaEnVentana: 4,
      vehiculosActivos: 183,
      vehiculosAltaEnVentana: 12,
    };
  }
  async conteosDeVisitantes(_c: string, v: VentanaDelDia): Promise<ConteosDeVisitantes> {
    this.ventanasRecibidas.push(v);
    return { autorizacionesDelDia: 34, dentroAhora: 8 };
  }
  async conteosDeAlertas(): Promise<ConteosDeAlertas> {
    return { pendientes: 3, severidadMaxima: 'alta' };
  }
  async accesosPorHora(): Promise<readonly FranjaDeAccesos[]> {
    return this.franjas;
  }
  async dispositivos(): Promise<readonly DispositivoDelTablero[]> {
    return this.equipos;
  }
}

const relojEn = (iso: string): Reloj => ({ ahora: () => new Date(iso) });

const equipo = (nombre: string, ultimoLatido: Date | null): DispositivoDelTablero => ({
  id: `id-${nombre}`,
  nombre,
  tipo: 'camara_lpr',
  zonaId: null,
  host: 'equipo-de-prueba.invalid',
  puerto: 80,
  modelo: 'modelo-de-prueba',
  firmware: 'v0.0.0-prueba',
  ultimoLatido,
  ultimaSincronizacion: null,
});

let repo: RepositorioDoble;
beforeEach(() => {
  repo = new RepositorioDoble();
});

describe('ConsultarIndicadores', () => {
  it('calcula la ventana con la zona de la COPROPIEDAD, no con la del proceso', async () => {
    // 02:00 UTC del día 9 son las 21:00 del día 8 en Bogotá: el día que empieza
    // es el 8, no el 9. Con la zona del servidor saldría el 9 y el contador de
    // visitantes se mediría contra un día equivocado.
    const r = await new ConsultarIndicadores(repo, relojEn('2026-09-09T02:00:00Z')).ejecutar(COP);
    expect(r.ventana.zonaHoraria).toBe('America/Bogota');
    expect(r.ventana.desde.toISOString()).toBe('2026-09-08T05:00:00.000Z');
    expect(r.ventana.hasta.toISOString()).toBe('2026-09-09T05:00:00.000Z');
  });

  it('pasa la MISMA ventana a todas las consultas', async () => {
    await new ConsultarIndicadores(repo, relojEn('2026-09-09T14:00:00Z')).ejecutar(COP);
    const instantes = new Set(repo.ventanasRecibidas.map((v) => v.desde.getTime()));
    expect(instantes.size).toBe(1);
  });

  it('la zona configurada de la copropiedad manda sobre cualquier valor por defecto', async () => {
    repo.config = {
      copropiedadId: COP,
      zonaHoraria: 'UTC',
      umbralDeLatido: UMBRAL_DE_LATIDO_POR_DEFECTO,
    };
    const r = await new ConsultarIndicadores(repo, relojEn('2026-09-09T02:00:00Z')).ejecutar(COP);
    expect(r.ventana.desde.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('una copropiedad inexistente no devuelve ceros: falla', async () => {
    // Devolver ceros sería lo cómodo y sería mentir: un tablero en blanco es
    // indistinguible de una copropiedad sin actividad.
    repo.config = null;
    await expect(
      new ConsultarIndicadores(repo, relojEn('2026-09-09T14:00:00Z')).ejecutar(COP),
    ).rejects.toBeInstanceOf(CopropiedadDesconocida);
  });

  it('devuelve los cuatro conteos que pide el mockup', async () => {
    const r = await new ConsultarIndicadores(repo, relojEn('2026-09-09T14:00:00Z')).ejecutar(COP);
    expect(r.padron.residentesActivos).toBe(247);
    expect(r.padron.vehiculosActivos).toBe(183);
    expect(r.visitantes.autorizacionesDelDia).toBe(34);
    expect(r.alertas.pendientes).toBe(3);
    expect(r.alertas.severidadMaxima).toBe('alta');
  });
});

describe('ConsultarAccesosPorHora', () => {
  it('devuelve 24 franjas aunque el repositorio solo entregue las que tienen tráfico', async () => {
    repo.franjas = [{ hora: 8, permitidos: 12, negados: 1 }];
    const r = await new ConsultarAccesosPorHora(repo, relojEn('2026-09-09T14:00:00Z')).ejecutar(
      COP,
    );
    expect(r.franjas).toHaveLength(24);
    expect(r.franjas.map((f) => f.hora)).toEqual([...Array(24).keys()]);
    expect(r.franjas[8]).toEqual({ hora: 8, permitidos: 12, negados: 1 });
    expect(r.franjas[9]).toEqual({ hora: 9, permitidos: 0, negados: 0 });
  });

  it('un día entero sin accesos son 24 ceros, no una lista vacía', async () => {
    const r = await new ConsultarAccesosPorHora(repo, relojEn('2026-09-09T14:00:00Z')).ejecutar(
      COP,
    );
    expect(r.franjas).toHaveLength(24);
    expect(r.franjas.every((f) => f.permitidos === 0 && f.negados === 0)).toBe(true);
  });

  it('declara la zona con la que se agrupó', async () => {
    const r = await new ConsultarAccesosPorHora(repo, relojEn('2026-09-09T14:00:00Z')).ejecutar(
      COP,
    );
    expect(r.zonaHoraria).toBe('America/Bogota');
  });

  it('falla si la copropiedad no existe', async () => {
    repo.config = null;
    await expect(
      new ConsultarAccesosPorHora(repo, relojEn('2026-09-09T14:00:00Z')).ejecutar(COP),
    ).rejects.toBeInstanceOf(CopropiedadDesconocida);
  });
});

describe('ConsultarDispositivos', () => {
  const AHORA = '2026-09-09T14:00:00Z';

  it('deriva el estado del latido y no de ninguna columna', async () => {
    repo.equipos = [
      equipo('reciente', new Date('2026-09-09T13:59:30Z')), // 30 s → saludable
      equipo('rezagado', new Date('2026-09-09T13:56:00Z')), // 240 s → degradado
      equipo('mudo', new Date('2026-09-09T13:50:00Z')), // 600 s → caído
    ];
    const r = await new ConsultarDispositivos(repo, relojEn(AHORA)).ejecutar(COP);
    expect(r.dispositivos.map((d) => d.estado)).toEqual(['saludable', 'degradado', 'caido']);
    expect(r).toMatchObject({ saludables: 1, degradados: 1, caidos: 1 });
  });

  it('un dispositivo que NUNCA latió se cuenta como caído, no como sano', async () => {
    // «Sin noticias» y «todo bien» son lo mismo solo para quien no quiere
    // enterarse: es la regla que ya fijó P-06 en el dominio.
    repo.equipos = [equipo('recien-dado-de-alta', null)];
    const r = await new ConsultarDispositivos(repo, relojEn(AHORA)).ejecutar(COP);
    expect(r.dispositivos[0]?.estado).toBe('caido');
    expect(r.dispositivos[0]?.segundosSinLatir).toBeNull();
    expect(r.caidos).toBe(1);
  });

  it('usa el umbral CONFIGURADO por la copropiedad, no el de por defecto', async () => {
    repo.config = {
      copropiedadId: COP,
      zonaHoraria: 'America/Bogota',
      umbralDeLatido: {
        periodoSegundos: 600,
        latidosTolerados: 1,
        silencioParaCaidoSegundos: 3600,
      },
    };
    // 240 s de silencio: con el umbral por defecto sería `degradado`; con este,
    // `saludable`. Si el caso de uso ignorara la configuración, esto sería rojo.
    repo.equipos = [equipo('rezagado', new Date('2026-09-09T13:56:00Z'))];
    const r = await new ConsultarDispositivos(repo, relojEn(AHORA)).ejecutar(COP);
    expect(r.dispositivos[0]?.estado).toBe('saludable');
  });

  it('sin dispositivos registrados devuelve una lista vacía y ceros, no un fallo', async () => {
    const r = await new ConsultarDispositivos(repo, relojEn(AHORA)).ejecutar(COP);
    expect(r.dispositivos).toEqual([]);
    expect(r).toMatchObject({ saludables: 0, degradados: 0, caidos: 0 });
  });

  it('falla si la copropiedad no existe', async () => {
    repo.config = null;
    await expect(
      new ConsultarDispositivos(repo, relojEn(AHORA)).ejecutar(COP),
    ).rejects.toBeInstanceOf(CopropiedadDesconocida);
  });
});
