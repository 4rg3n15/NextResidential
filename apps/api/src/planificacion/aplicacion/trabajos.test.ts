import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { HORARIOS, trabajoPorCopropiedad } from './trabajos';
import type { CatalogoDeCopropiedades, Planificador } from './puertos';
import { CatalogoDeCopropiedadesEnMemoria } from '../infraestructura/catalogo-copropiedades-pg';
import { PlanificadorInerte } from '../infraestructura/planificador-inerte';
import { CicloDelPlanificador, trabajosDeMantenimiento } from '../planificacion.module';
import type { CasosDeUsoDeMantenimiento } from '../planificacion.module';

const bitacoraDePrueba = (): { bitacora: Bitacora; lineas: string[] } => {
  const lineas: string[] = [];
  return {
    lineas,
    bitacora: {
      registrar: (nivel, mensaje, contexto) =>
        void lineas.push(`${nivel}:${mensaje}:${JSON.stringify(contexto ?? {})}`),
    },
  };
};

describe('trabajoPorCopropiedad', () => {
  const catalogo = (ids: string[]): CatalogoDeCopropiedades =>
    new CatalogoDeCopropiedadesEnMemoria(ids);

  it('recorre las copropiedades ACTIVAS y suma sus cifras', async () => {
    const { bitacora } = bitacoraDePrueba();
    const vistas: string[] = [];
    const trabajo = trabajoPorCopropiedad(
      {
        nombre: 'sonda',
        cron: '* * * * *',
        descripcion: 'x',
        ejecutar: async (id) => {
          vistas.push(id);
          return { suprimidas: 2 };
        },
      },
      catalogo(['cop-a', 'cop-b']),
      bitacora,
    );
    expect(await trabajo.ejecutar()).toEqual({
      copropiedades: 2,
      fallidas: 0,
      suprimidas: 4,
    });
    expect(vistas).toEqual(['cop-a', 'cop-b']);
  });

  it('UN FALLO EN UNA NO DETIENE LAS DEMÁS, y se registra con su copropiedad', async () => {
    /**
     * Es la decisión más importante del fichero. Sin ella, una copropiedad con
     * una terminal inalcanzable dejaría sin barrer a todas las que vinieran
     * detrás, y el incumplimiento de RN-11 sería de todo el sistema.
     */
    const { bitacora, lineas } = bitacoraDePrueba();
    const trabajo = trabajoPorCopropiedad(
      {
        nombre: 'sonda',
        cron: '* * * * *',
        descripcion: 'x',
        ejecutar: async (id) => {
          if (id === 'cop-b') throw new Error('la terminal no responde');
          return { suprimidas: 1 };
        },
      },
      catalogo(['cop-a', 'cop-b', 'cop-c']),
      bitacora,
    );
    expect(await trabajo.ejecutar()).toEqual({
      copropiedades: 3,
      fallidas: 1,
      suprimidas: 2, // la a y la c SÍ se barrieron
    });
    const error = lineas.find((l) => l.startsWith('error:'));
    expect(error).toContain('cop-b');
    expect(error).toContain('la terminal no responde');
  });

  it('sin copropiedades activas no hace nada y lo dice con cifras', async () => {
    const { bitacora } = bitacoraDePrueba();
    const trabajo = trabajoPorCopropiedad(
      { nombre: 's', cron: '* * * * *', descripcion: 'x', ejecutar: async () => ({ n: 1 }) },
      catalogo([]),
      bitacora,
    );
    expect(await trabajo.ejecutar()).toEqual({ copropiedades: 0, fallidas: 0 });
  });

  it('los tres horarios son expresiones cron de CINCO campos', () => {
    for (const cron of Object.values(HORARIOS)) {
      expect(cron.trim().split(/\s+/)).toHaveLength(5);
    }
  });
});

describe('PlanificadorInerte', () => {
  it('REGISTRA lo que no va a ejecutar, en vez de callarse', async () => {
    // El silencio dejaría creer que el barrido de plantillas está corriendo, y
    // RN-11 tiene un plazo legal detrás.
    const { bitacora, lineas } = bitacoraDePrueba();
    const inerte = new PlanificadorInerte(bitacora, 'PLANIFICADOR_HABILITADO=false');
    inerte.programar({
      nombre: 'ncr.barrer-plantillas',
      cron: HORARIOS.plantillas,
      descripcion: 'x',
      ejecutar: async () => ({ suprimidas: 0 }),
    });
    await inerte.arrancar();
    expect(lineas[0]).toContain('aviso:trabajo programado NO se ejecutará');
    expect(lineas[0]).toContain('ncr.barrer-plantillas');
    expect(lineas[0]).toContain('PLANIFICADOR_HABILITADO=false');
  });

  it('permite dispararlo a mano, y devuelve null si no existe', async () => {
    const { bitacora } = bitacoraDePrueba();
    const inerte = new PlanificadorInerte(bitacora, 'motivo');
    inerte.programar({
      nombre: 'ncr.sonda',
      cron: '* * * * *',
      descripcion: 'x',
      ejecutar: async () => ({ hechas: 3 }),
    });
    expect(await inerte.ejecutarAhora('ncr.sonda')).toEqual({ hechas: 3 });
    expect(await inerte.ejecutarAhora('no-existe')).toBeNull();
    expect(inerte.programados).toHaveLength(1);
    await expect(inerte.detener()).resolves.toBeUndefined();
  });
});

describe('CatalogoDeCopropiedadesEnMemoria', () => {
  it('declara y devuelve', async () => {
    const catalogo = new CatalogoDeCopropiedadesEnMemoria();
    expect(await catalogo.activas()).toEqual([]);
    catalogo.declarar(['a']);
    expect(await catalogo.activas()).toEqual(['a']);
  });
});

describe('los TRES trabajos que la ETAPA 14 debía dar', () => {
  const casos = () => {
    const vistas: string[] = [];
    return {
      vistas,
      casos: {
        latidos: {
          ejecutar: async (id: string) => {
            vistas.push(`latidos:${id}`);
            return { revisados: 4, caidos: ['d1'], degradados: [], alertasAbiertas: 1 };
          },
        },
        aforos: {
          ejecutar: async (id: string) => {
            vistas.push(`aforos:${id}`);
            return { zonas: 3, reiniciadas: 2 };
          },
        },
        plantillas: {
          ejecutar: async () => ({
            ok: true as const,
            valor: { suprimidas: 5, retiradas: 4, retiradasFallidas: 1 },
          }),
        },
      },
    };
  };

  it('son tres, con nombre estable y horario declarado', async () => {
    const { casos: c } = casos();
    const { bitacora } = bitacoraDePrueba();
    const trabajos = trabajosDeMantenimiento(
      c as unknown as CasosDeUsoDeMantenimiento,
      new CatalogoDeCopropiedadesEnMemoria(['cop-a']),
      bitacora,
    );
    expect(trabajos.map((t) => t.nombre)).toEqual([
      'ncr.vigilar-latidos',
      'ncr.reiniciar-aforos',
      'ncr.barrer-plantillas',
    ]);
    // El nombre es la CLAVE de la cola de pg-boss: cambiarlo crea una cola
    // nueva y abandona la anterior con sus horarios dentro.
    expect(new Set(trabajos.map((t) => t.nombre)).size).toBe(3);
    for (const t of trabajos) expect(t.descripcion).toMatch(/D-3[16]|D-40/);
  });

  it('cada uno invoca SU caso de uso con la copropiedad explícita', async () => {
    // §2.7.6 · el worker usa la llave secreta, que omite la RLS. Pasar la
    // copropiedad explícitamente a cada caso de uso ES la validación de
    // aislamiento en la capa de aplicación que esa regla exige.
    const { casos: c, vistas } = casos();
    const { bitacora } = bitacoraDePrueba();
    const [latidos, aforos, plantillas] = trabajosDeMantenimiento(
      c as unknown as CasosDeUsoDeMantenimiento,
      new CatalogoDeCopropiedadesEnMemoria(['cop-a', 'cop-b']),
      bitacora,
    );
    expect(await latidos!.ejecutar()).toEqual({
      copropiedades: 2,
      fallidas: 0,
      revisados: 8,
      caidos: 2,
      degradados: 0,
      alertas: 2,
    });
    expect(vistas).toEqual(['latidos:cop-a', 'latidos:cop-b']);
    expect(await aforos!.ejecutar()).toEqual({
      copropiedades: 2,
      fallidas: 0,
      zonas: 6,
      reiniciadas: 4,
    });
    expect(await plantillas!.ejecutar()).toEqual({
      copropiedades: 2,
      fallidas: 0,
      suprimidas: 10,
      retiradas: 8,
      retiradasFallidas: 2,
    });
  });

  it('un barrido de plantillas que FALLA no se cuenta como suprimido', async () => {
    const { casos: c } = casos();
    const { bitacora } = bitacoraDePrueba();
    const trabajos = trabajosDeMantenimiento(
      {
        ...(c as unknown as CasosDeUsoDeMantenimiento),
        plantillas: {
          ejecutar: async () => ({ ok: false as const, error: { motivo: 'no encontrado' } }),
        } as unknown as CasosDeUsoDeMantenimiento['plantillas'],
      },
      new CatalogoDeCopropiedadesEnMemoria(['cop-a']),
      bitacora,
    );
    expect(await trabajos[2]!.ejecutar()).toEqual({
      copropiedades: 1,
      fallidas: 0,
      suprimidas: 0,
      retiradas: 0,
      retiradasFallidas: 0,
    });
  });
});

describe('CicloDelPlanificador · el arranque de la API no depende de la cola', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * REGRESIÓN DE UN DEFECTO REAL, DESTAPADO POR EL PASO 12c.
   *
   * `onApplicationBootstrap` corre DENTRO de `app.listen()`. La primera versión
   * de este módulo esperaba a que pg-boss abriera su conexión, y con una
   * `DATABASE_URL` que no resuelve el proceso moría con
   * «Fallo al arrancar la API: getaddrinfo ENOTFOUND base» **después de haber
   * mapeado todas sus rutas**. Una cola caída dejaba sin portería a una
   * copropiedad entera.
   *
   * Lo que se comprueba aquí: que el ciclo TERMINA aunque el planificador
   * falle, y que el fallo no se traga —un planificador que no arrancó
   * significa que RN-11 no se está cumpliendo—.
   */
  const cicloCon = (planificador: Planificador, bitacora: Bitacora) => {
    const casos = {
      latidos: {
        ejecutar: async () => ({ revisados: 0, caidos: [], degradados: [], alertasAbiertas: 0 }),
      },
      aforos: { ejecutar: async () => ({ zonas: 0, reiniciadas: 0 }) },
      plantillas: {
        ejecutar: async () => ({
          ok: true as const,
          valor: { suprimidas: 0, retiradas: 0, retiradasFallidas: 0 },
        }),
      },
    };
    const referencia = {
      get: (token: unknown) => {
        const nombre = (token as { name?: string })?.name ?? '';
        if (nombre.includes('Latidos')) return casos.latidos;
        if (nombre.includes('Aforos')) return casos.aforos;
        return casos.plantillas;
      },
    };
    return new CicloDelPlanificador(
      planificador,
      new CatalogoDeCopropiedadesEnMemoria(['cop-a']),
      bitacora,
      referencia as never,
    );
  };

  it('si el planificador NO arranca, el ciclo termina igual y lo REGISTRA', async () => {
    const { bitacora, lineas } = bitacoraDePrueba();
    const roto: Planificador = {
      programados: [],
      programar: () => undefined,
      arrancar: async () => {
        throw new Error('getaddrinfo ENOTFOUND servidor-que-no-existe.invalid');
      },
      detener: async () => undefined,
    };
    await expect(cicloCon(roto, bitacora).onApplicationBootstrap()).resolves.toBeUndefined();
    // La promesa del arranque se resuelve fuera del `await`: se le da un turno.
    await new Promise((r) => setTimeout(r, 0));
    const error = lineas.find((l) => l.startsWith('error:'));
    expect(error).toContain('el planificador NO arrancó');
    expect(error).toContain('RN-11');
  });

  it('con un planificador sano, programa los TRES trabajos', async () => {
    const { bitacora } = bitacoraDePrueba();
    const programados: string[] = [];
    const sano: Planificador = {
      programados: [],
      programar: (t) => void programados.push(t.nombre),
      arrancar: async () => undefined,
      detener: async () => undefined,
    };
    await cicloCon(sano, bitacora).onApplicationBootstrap();
    expect(programados).toEqual([
      'ncr.vigilar-latidos',
      'ncr.reiniciar-aforos',
      'ncr.barrer-plantillas',
    ]);
  });
});
