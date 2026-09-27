import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Rol } from '../src/autenticacion';
import { NAVEGACION } from '../../web/src/lib/navegacion';
import { crearApp, crearFirmante, rutasConRol } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-03, AHORA SOBRE «VISITANTES» (15-L, F)
 *
 * En sitio, una pantalla que un rol SÍ veía llamaba a una ruta que ese rol no
 * tenía: la guarda respondía 403 y la función no existía para él. Aquí se
 * cruzan las DOS fuentes, leídas del código: las rutas que llama la pantalla
 * de Visitantes (y los componentes que monta) y los `@Roles` de la API, para
 * cada rol que ve la entrada en la navegación.
 *
 * Dos rutas se reservan a propósito a menos roles, y la pantalla lo sabe:
 * rechazar (portería y superadministración, F2) y reintentar la foto en un
 * equipo concreto no se usa. Se declaran con sus roles exactos, y se exige que
 * la API diga lo MISMO que la pantalla: si una de las dos cambia, esto falla.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const WEB = resolve(process.cwd(), '../web/src');
const FUENTES = [
  join(WEB, 'app/(consola)/visitantes'),
  join(WEB, 'componentes/rechazo-de-visita.tsx'),
  join(WEB, 'componentes/aviso-de-visita.tsx'),
  join(WEB, 'componentes/fotografia-visitante.tsx'),
  join(WEB, 'lib/api/visitas.ts'),
];

const ficheros = (ruta: string): string[] =>
  ruta.endsWith('.ts') || ruta.endsWith('.tsx')
    ? [ruta]
    : readdirSync(ruta)
        .filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))
        .map((n) => join(ruta, n));

const rutasDeLaPantalla = (): string[] => {
  const encontradas = new Set<string>();
  for (const f of FUENTES.flatMap(ficheros)) {
    const texto = readFileSync(f, 'utf8');
    for (const m of texto.matchAll(/cliente\.(GET|POST|PUT|PATCH|DELETE)\(\s*'([^']+)'/g)) {
      encontradas.add(`${m[1]!} ${m[2]!.replace(/\{(\w+)\}/g, ':$1')}`);
    }
  }
  return [...encontradas].sort();
};

/** Rutas que la pantalla sólo ofrece a algunos roles, con esos roles EXACTOS. */
const RESTRINGIDAS: Readonly<Record<string, readonly Rol[]>> = {
  'POST /copropiedades/:id/visitas/:autorizacionId/rechazo': ['portero', 'superadministrador'],
};

const entrada = NAVEGACION.find((e) => e.clave === 'visitantes');
const ROLES = [...(entrada?.roles ?? [])] as Rol[];

let app: INestApplication;
beforeAll(async () => {
  app = await crearApp(await crearFirmante());
});
afterAll(async () => {
  await app?.close();
});

const permitidas = (rol: Rol): Set<string> =>
  new Set(rutasConRol(app, rol).map((r) => `${r.metodo} ${r.ruta}`));

describe('H-SITIO-03 · las rutas de «Visitantes» contra los roles que la ven', () => {
  it('las dos fuentes se leyeron: una lista vacía pasaría cualquier aserción', () => {
    expect(ROLES).toEqual(
      expect.arrayContaining([
        'superadministrador',
        'administrador',
        'portero',
        'operador_central',
      ]),
    );
    const rutas = rutasDeLaPantalla();
    expect(rutas).toContain('POST /copropiedades/:id/visitas');
    expect(rutas).toContain('GET /copropiedades/:id/visitas');
    expect(rutas).toContain('POST /copropiedades/:id/visitas/:autorizacionId/rechazo');
    // 7 desde la corrección de la 15-L: la confirmación presencial (y su ruta)
    // se retiró de la pantalla por decisión del cliente (ADR-032, enmienda).
    expect(rutas).not.toContain(
      'POST /copropiedades/:id/biometria/consentimientos/:consentimientoId/aceptacion-presencial',
    );
    expect(rutas.length).toBeGreaterThanOrEqual(7);
  });

  it.each(ROLES)('%s: ninguna ruta que la pantalla le ofrece lo rechaza por rol', (rol) => {
    const suyas = permitidas(rol);
    const faltan = rutasDeLaPantalla().filter(
      (r) => RESTRINGIDAS[r] === undefined && !suyas.has(r),
    );
    expect(faltan, `${rol}: la pantalla llama a rutas que su rol no tiene`).toEqual([]);
  });

  it('las restringidas: la API reserva EXACTAMENTE los roles que la pantalla habilita', () => {
    // Se lee del FUENTE de la pantalla: importarlo arrastraría el cliente web entero.
    const fuente = readFileSync(join(WEB, 'componentes/rechazo-de-visita.tsx'), 'utf8');
    const conjunto = /ROLES_QUE_RECHAZAN[^=]*=\s*new Set\(\[([^\]]+)\]\)/.exec(fuente)?.[1] ?? '';
    const ROLES_QUE_RECHAZAN = [...conjunto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(ROLES_QUE_RECHAZAN.length, 'no se encontró ROLES_QUE_RECHAZAN').toBeGreaterThan(0);
    for (const [ruta, roles] of Object.entries(RESTRINGIDAS)) {
      const conRuta = (
        ['superadministrador', 'administrador', 'portero', 'operador_central', 'residente'] as Rol[]
      ).filter((r) => permitidas(r).has(ruta));
      expect(conRuta.sort(), ruta).toEqual([...roles].sort());
    }
    expect([...ROLES_QUE_RECHAZAN].sort()).toEqual(
      [...(RESTRINGIDAS['POST /copropiedades/:id/visitas/:autorizacionId/rechazo'] ?? [])].sort(),
    );
  });
});
