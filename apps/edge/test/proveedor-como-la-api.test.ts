import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Vigencia } from '@ncr/domain-core';
import { FotoNoAdmitida, equiposSimulados, jpegConMedidas, personasPor } from '@ncr/providers';
import { esquemaConfiguracion } from '../../api/src/configuracion/esquema';
import { componerEdge } from '../src/composicion';
import { ajustesDelProveedor, esquemaDeAjustes } from '../src/configuracion/esquema-de-ajustes';
import { cargarConfiguracionDeSitio } from '../src/configuracion/esquema-de-sitio';
import { PLANTILLA, TERMINAL, entornoDeSitio } from './banco-de-sitio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DT-15R-09 · EL PROVEEDOR DEL EDGE SE COMPONE COMO EL DE LA API, Y SIGUE ASÍ
 *
 * La causa de fondo no era un umbral olvidado: eran DOS raíces de composición
 * del mismo proveedor que nadie comparaba. Aquí se comparan, en tres planos:
 *
 *  1 · las variables: mismos valores por omisión y mismos límites que la API;
 *  2 · la lista: toda variable que la API pasa al proveedor la lee también el
 *      Edge, o está exenta con su motivo. Una opción nueva en la API sin su
 *      pareja en el Edge rompe aquí, no en sitio;
 *  3 · el efecto: zona, plantilla horaria y foto llegan de verdad al equipo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const DE_LA_API = esquemaConfiguracion.shape;
const DEL_EDGE = esquemaDeAjustes.shape;
const VARIABLES = Object.keys(DEL_EDGE) as (keyof typeof DEL_EDGE)[];

/** Lo que la API pasa al proveedor y el Edge NO lee, cada una con su motivo. */
const EXENTAS = new Map([
  ['GUARDIA_AUDIO_TRANSPORTE', 'el Edge puente fija el audio persistente (15-Q2): DT-15R-C02'],
]);

/** Las variables que la API lee dentro de su `crearProveedorDeEquipos({ … })`. */
const queLaApiPasa = (fuente: string): string[] => {
  const inicio = fuente.indexOf('crearProveedorDeEquipos({');
  const fin = fuente.indexOf('});', inicio);
  if (inicio < 0 || fin < 0) throw new Error('no encuentro la composición del proveedor en la API');
  const usadas = [...fuente.slice(inicio, fin).matchAll(/configuracion\.([A-Z][A-Z0-9_]*)/g)];
  return [...new Set(usadas.map((m) => m[1] ?? ''))].sort();
};
const sinPareja = (fuente: string): string[] =>
  queLaApiPasa(fuente).filter((v) => !(v in DEL_EDGE) && !EXENTAS.has(v));
const FUENTE_DE_LA_API = readFileSync(
  new URL('../../api/src/proveedores/proveedores.module.ts', import.meta.url),
  'utf8',
);

describe('1 · las variables del Edge son las de la API', () => {
  it.each(VARIABLES)('%s: el mismo valor por omisión', (v) => {
    expect(DEL_EDGE[v].parse(undefined)).toEqual(DE_LA_API[v].parse(undefined));
  });

  const PRUEBAS = ['0', '1', '159', '160', '499', '500', '554', '3600', '3601', '65535', '65536'];
  const OTRAS = ['', ' ', '-1', '2.5', 'abc', 'America/Bogota', 'Marte/Olimpo', '123456'];
  it.each(VARIABLES)('%s: acepta y rechaza exactamente lo mismo', (v) => {
    for (const valor of [...PRUEBAS, ...OTRAS]) {
      expect(DEL_EDGE[v].safeParse(valor).success, `${v}=${valor}`).toBe(
        DE_LA_API[v].safeParse(valor).success,
      );
    }
  });
});

describe('2 · lo que la API pasa al proveedor, el Edge también lo lee', () => {
  it('ninguna variable de la composición de la API se queda sin pareja en el Edge', () => {
    expect(queLaApiPasa(FUENTE_DE_LA_API).length).toBeGreaterThanOrEqual(VARIABLES.length);
    expect(sinPareja(FUENTE_DE_LA_API)).toEqual([]);
  });

  it('una opción NUEVA en la API sin su pareja en el Edge se detecta (prueba negativa)', () => {
    const conUnaMas = FUENTE_DE_LA_API.replace(
      'crearProveedorDeEquipos({',
      'crearProveedorDeEquipos({ nueva: configuracion.EQUIPOS_OPCION_NUEVA,',
    );
    expect(sinPareja(conUnaMas)).toEqual(['EQUIPOS_OPCION_NUEVA']);
  });

  it('cada exención sigue en uso: si la API deja de pasarla, sale de la lista', () => {
    for (const exenta of EXENTAS.keys()) expect(queLaApiPasa(FUENTE_DE_LA_API)).toContain(exenta);
  });

  it('los ajustes salen como los compone la API, por omisión y cambiados', () => {
    const porOmision = esquemaDeAjustes.parse({});
    expect(ajustesDelProveedor(porOmision)).toEqual({
      tiempoLimiteMs: 5000,
      persona: { zonaHoraria: 'America/Bogota', planDeHorario: '1' },
      limitesDeFoto: { bytesMaximos: 200 * 1024, ladoMaximo: 1024 },
      puertoRtsp: 554,
      desvioDeRelojMaximoS: 30,
    });
    const cambiados = esquemaDeAjustes.parse({
      EQUIPOS_TIEMPO_LIMITE_MS: '8000',
      EQUIPOS_FOTO_KB_MAXIMOS: '300',
      VIDEO_PUERTO_RTSP: '8554',
      EQUIPOS_DESVIO_DE_RELOJ_S: '60',
    });
    expect(ajustesDelProveedor(cambiados)).toMatchObject({
      tiempoLimiteMs: 8000,
      limitesDeFoto: { bytesMaximos: 300 * 1024 },
      puertoRtsp: 8554,
      desvioDeRelojMaximoS: 60,
    });
  });
});

describe('3 · los ajustes llegan al equipo por el proveedor del Edge', () => {
  const AHORA = new Date('2026-10-03T13:00:00.000Z');
  const cerrar: (() => void)[] = [];
  afterEach(() => cerrar.splice(0).forEach((c) => c()));
  let n = 0;

  const altaEnUnaTerminal = async (entorno: Record<string, string>, foto = jpegConMedidas()) => {
    n += 1;
    const host = `terminal-${String(n)}.ajustes.simulado.invalid`;
    const simulado = equiposSimulados({
      [host]: { familia: 'terminal', usuario: 'u', clave: 'c', hora: AHORA.toISOString() },
    });
    /** Lo ESCRITO en las personas del equipo; las consultas de capacidades no cuentan. */
    const cuerpos: string[] = [];
    const peticion = (async (entrada: string | URL, init?: RequestInit) => {
      const escritura = (init?.method ?? 'GET') !== 'GET';
      if (escritura && String(entrada).includes('/UserInfo/')) cuerpos.push(String(init?.body));
      return simulado(entrada, init);
    }) as typeof fetch;
    const equipo = { dispositivoId: TERMINAL, tipo: 'terminal_facial', host, puerto: 80 };
    const edge = componerEdge(
      cargarConfiguracionDeSitio(
        entornoDeSitio({
          EDGE_EQUIPOS: JSON.stringify([
            { ...equipo, usuario: 'u', clave: 'c', numeroDePuerta: 1 },
          ]),
          ...entorno,
        }),
      ),
      { registrar: () => undefined, reloj: { ahora: () => AHORA }, peticionAEquipos: peticion },
    );
    cerrar.push(() => edge.db.close());
    const r = Vigencia.crear(AHORA, new Date('2026-10-03T19:00:00.000Z'));
    if (!r.ok) throw new Error('vigencia de prueba');
    const alta = edge.proveedor.sincronizar(TERMINAL, PLANTILLA, foto, r.valor);
    return { alta, cuerpos, persona: () => [...(personasPor.get(host)?.values() ?? [])][0] };
  };

  it('EQUIPOS_ZONA_HORARIA: la vigencia se escribe en la hora local de ESA zona', async () => {
    const bogota = await altaEnUnaTerminal({});
    await bogota.alta;
    expect(bogota.persona()?.desde).toBe('2026-10-03T08:00:00');
    const mexico = await altaEnUnaTerminal({ EQUIPOS_ZONA_HORARIA: 'America/Mexico_City' });
    await mexico.alta;
    expect(mexico.persona()?.desde).toBe('2026-10-03T07:00:00');
  });

  it('TERMINAL_PLAN_DE_HORARIO: la puerta de la persona lleva esa plantilla', async () => {
    const t = await altaEnUnaTerminal({ TERMINAL_PLAN_DE_HORARIO: '65535' });
    await t.alta;
    expect(t.cuerpos.join('\n')).toContain('"planTemplateNo":"65535"');
  });

  it('EQUIPOS_FOTO_LADO_MAXIMO: una foto mayor no sale hacia el equipo', async () => {
    const t = await altaEnUnaTerminal(
      { EQUIPOS_FOTO_LADO_MAXIMO: '320' },
      jpegConMedidas(640, 480),
    );
    await expect(t.alta).rejects.toBeInstanceOf(FotoNoAdmitida);
    expect(t.cuerpos).toEqual([]);
    expect(t.persona()).toBeUndefined();
  });
});
