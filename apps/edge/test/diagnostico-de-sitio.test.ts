import { describe, expect, it } from 'vitest';
import { cargarConfiguracionDeSitio } from '../src/configuracion/esquema-de-sitio';
import { diagnosticarSitio } from '../src/diagnostico-de-sitio';
import type { DependenciasDelDiagnostico } from '../src/diagnostico-de-sitio';
import { abrirBase } from '../src/infraestructura/sqlite/esquema';
import { CacheDeReglasSqlite } from '../src/infraestructura/sqlite/cache-de-reglas';
import { equiposSimulados } from '@ncr/providers';
import {
  CAMARA,
  NubeDePrueba,
  TERMINAL,
  entornoDeSitio,
  equiposDeSitio,
  instantaneaDePrueba,
} from './banco-de-sitio';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 15-Q · Q7 · `pnpm sitio:edge` contra la nube de prueba y los equipos
 * simulados de `providers`: cada pregunta, con su respuesta buena y su mala.
 */
const conHora = (nube: NubeDePrueba, fecha: Date | null, ready = 200): typeof fetch =>
  (async (entrada: string | URL, init?: RequestInit) => {
    if (String(entrada).endsWith('/ready')) {
      if (!nube.wan) throw new TypeError('fetch failed');
      const headers: Record<string, string> = fecha === null ? {} : { date: fecha.toUTCString() };
      return new Response('{}', { status: ready, headers });
    }
    return nube.transporte(entrada, init);
  }) as typeof fetch;

const montar = (cambios: Record<string, string> = {}, deps: DependenciasDelDiagnostico = {}) => {
  const nube = new NubeDePrueba();
  const config = cargarConfiguracionDeSitio(entornoDeSitio(cambios));
  return {
    nube,
    correr: (extra: DependenciasDelDiagnostico = {}) =>
      diagnosticarSitio(config, {
        transporteDeNube: conHora(nube, new Date()),
        peticionAEquipos: equiposDeSitio().peticion,
        interfaces: () => ['127.0.0.1'],
        ...deps,
        ...extra,
      }),
  };
};

const estados = (pasos: readonly { paso: string; estado: string }[]) =>
  Object.fromEntries(pasos.map((p) => [p.paso.split(' ')[0], p.estado]));

describe('pnpm sitio:edge (15-Q, Q7)', () => {
  it('todo en orden: interfaz, nube en hora, credencial aceptada y los dos equipos alcanzados', async () => {
    const pasos = await montar().correr();
    // La base en memoria del banco no tiene reglas todavía: eso es un AVISO, no un fallo.
    expect(pasos.map((p) => p.estado)).toEqual(['OK', 'OK', 'OK', 'OK', 'OK', 'AVISO']);
    expect(pasos[2]?.detalle).toContain('versión 1 · 1 autorizaciones');
    // Nunca una IP ni una clave en la salida (RN-21).
    expect(JSON.stringify(pasos)).not.toMatch(/127\.0\.0\.1|clave-simulada|servicio/);
  });

  it('una interfaz que no es de este equipo es FALLO', async () => {
    const pasos = await montar().correr({ interfaces: () => ['192.0.2.9'] });
    expect(pasos[0]).toMatchObject({ paso: 'escucha local', estado: 'FALLO' });
    // Sin inyectarlas: las interfaces reales de este equipo, que siempre tienen el bucle local.
    const reales = await diagnosticarSitio(cargarConfiguracionDeSitio(entornoDeSitio()), {
      transporteDeNube: conHora(new NubeDePrueba(), new Date()),
      peticionAEquipos: equiposDeSitio().peticion,
    });
    expect(reales[0]).toMatchObject({ estado: 'OK' });
  });

  it('el reloj desviado más de lo tolerable es FALLO; sin cabecera de hora, OK', async () => {
    const { nube, correr } = montar();
    const tarde = await correr({ transporteDeNube: conHora(nube, new Date(Date.now() - 600_000)) });
    expect(tarde[1]).toMatchObject({ estado: 'FALLO' });
    expect(tarde[1]?.detalle).toContain('§5');
    const sinHora = await correr({ transporteDeNube: conHora(nube, null) });
    expect(sinHora[1]?.detalle).toContain('sin hora');
  });

  it('sin WAN o con la API no lista, AVISO: el Edge seguiría en contingencia', async () => {
    const { nube, correr } = montar();
    const noLista = await correr({ transporteDeNube: conHora(nube, new Date(), 503) });
    expect(noLista[1]).toMatchObject({ estado: 'AVISO' });
    nube.wan = false;
    expect(estados(await correr())).toMatchObject({ nube: 'AVISO', identidad: 'AVISO' });
  });

  it('401, 404 y 409 de la API dicen QUÉ variable mirar', async () => {
    for (const [status, texto] of [
      [401, 'EDGE_INGESTA_SECRETO'],
      [404, 'EDGE_COPROPIEDAD_ID'],
      [409, '§4.4'],
    ] as const) {
      const { nube, correr } = montar();
      const transporte = (async (entrada: string | URL, init?: RequestInit) =>
        String(entrada).includes('/reglas/')
          ? new Response('{}', { status })
          : conHora(nube, new Date())(entrada, init)) as typeof fetch;
      const pasos = await correr({ transporteDeNube: transporte });
      expect(pasos[2]).toMatchObject({ estado: 'FALLO' });
      expect(pasos[2]?.detalle).toContain(texto);
    }
  });

  it('reglas de otra copropiedad o alteradas son FALLO', async () => {
    const ajena = montar();
    ajena.nube.instantanea = { ...instantaneaDePrueba(), copropiedadId: 'otra' };
    expect((await ajena.correr())[2]).toMatchObject({ estado: 'FALLO' });
    const alterada = montar();
    alterada.nube.instantanea = { ...instantaneaDePrueba(), placasEnListaNegra: [] };
    expect((await alterada.correr())[2]?.detalle).toContain('alterada');
  });

  it('un equipo inexistente o con la clave mala es FALLO, nombrado por su UUID', async () => {
    const malos = JSON.stringify([
      {
        dispositivoId: '90000000-0000-4000-8000-0000000000aa',
        tipo: 'terminal_facial',
        host: 'nadie.simulado.invalid',
        puerto: 8009,
        usuario: 'u',
        clave: 'c',
      },
      {
        dispositivoId: '90000000-0000-4000-8000-0000000000bb',
        tipo: 'terminal_facial',
        host: '127.0.0.1',
        puerto: 8002,
        usuario: 'servicio',
        clave: 'mala',
      },
    ]);
    // Nadie escucha en 8009: la conexión se rechaza, como en la red real.
    const simulados = equiposDeSitio().peticion;
    const peticionAEquipos = (async (u: string | URL, i?: RequestInit) =>
      String(u).includes(':8009/')
        ? Promise.reject(new TypeError('fetch failed: ECONNREFUSED'))
        : simulados(u, i)) as typeof fetch;
    const pasos = await montar({ EDGE_EQUIPOS: malos }).correr({ peticionAEquipos });
    expect(pasos[3]).toMatchObject({
      paso: 'terminal_facial 90000000-0000-4000-8000-0000000000aa',
      estado: 'FALLO',
    });
    expect(pasos[3]?.detalle).toContain('no hay un equipo');
    expect(pasos[4]?.detalle).toContain('bloquea la cuenta');
  });

  it('una cámara que decide sola es FALLO; un equipo con la hora desviada, AVISO', async () => {
    const peticionAEquipos = equiposSimulados({
      'cam.simulado.invalid': { familia: 'camara', usuario: 's', clave: 'k', ctrlMod: '0' },
      'term.simulado.invalid': {
        familia: 'terminal',
        usuario: 's',
        clave: 'k',
        hora: '2020-01-01T00:00:00+00:00',
      },
    });
    const comun = { usuario: 's', clave: 'k' };
    const equipos = JSON.stringify([
      {
        ...comun,
        dispositivoId: CAMARA,
        tipo: 'camara_lpr',
        host: 'cam.simulado.invalid',
        secretoAlarmServer: 'a'.repeat(32),
      },
      { ...comun, dispositivoId: TERMINAL, tipo: 'terminal_facial', host: 'term.simulado.invalid' },
    ]);
    const pasos = await montar({ EDGE_EQUIPOS: equipos }).correr({ peticionAEquipos });
    expect(pasos[3]).toMatchObject({ estado: 'FALLO' });
    expect(pasos[3]?.detalle).toContain('modo evento');
    expect(pasos[4]).toMatchObject({ estado: 'AVISO' });
    expect(pasos[4]?.detalle).toContain('reloj');
  });

  it('la base local: inexistente, sin reglas, con reglas viejas y con accesos sin reconciliar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ncr-diag-'));
    const ruta = join(dir, 'edge.sqlite');
    const { nube, correr } = montar({ SQLITE_PATH: ruta });
    nube.instantanea = instantaneaDePrueba(3);
    expect((await correr()).at(-1)?.detalle).toContain('todavía no existe');

    const db = abrirBase(ruta);
    db.close();
    expect((await correr()).at(-1)?.detalle).toContain('TODO se negaría');

    const conReglas = abrirBase(ruta);
    new CacheDeReglasSqlite(conReglas).guardar(instantaneaDePrueba(3, new Date().toISOString()));
    conReglas.close();
    expect((await correr()).at(-1)).toMatchObject({ estado: 'OK' });
    const enDosDias = () => new Date(Date.now() + 2 * 24 * 3_600_000);
    expect((await correr({ ahora: enDosDias })).at(-1)).toMatchObject({ estado: 'AVISO' });
    // La nube vuelve a v1 con la caché en v3: su base se restauró de una copia.
    nube.instantanea = instantaneaDePrueba(1);
    expect((await correr()).at(-1)).toMatchObject({ estado: 'FALLO' });
  });
});
