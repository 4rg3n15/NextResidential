import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Acceso, Alerta, VersionDeReglas, esExito, permitir } from '@ncr/domain-core';
import type { Bitacora, HechoDeAcceso } from '@ncr/domain-core';
import { ACTOR_INGESTA } from '../src/comun/actores-de-servicio';
import { RepositorioEventosPgDeServicio } from '../src/eventos/infraestructura/repositorio-eventos-pg-de-servicio';
import { RepositorioAlertasPg } from '../src/eventos/infraestructura/repositorio-alertas-pg';
import {
  AlertasDelCicloDelEquipo,
  NOTA_DE_RESOLUCION_AUTOMATICA,
} from '../src/eventos/aplicacion/alertas-del-ciclo-del-equipo';
import { RegistroDeAuditoriaPg } from '../src/comun/auditoria/auditoria-pg';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-139 · LO QUE LA PRUEBA EN SITIO NECESITA QUE SOBREVIVA A UN REINICIO
 *
 * Cada bloque escribe con UNA instancia (un `Pool`) y lee con OTRA: es la
 * forma más honesta de «reiniciar la API» dentro de una prueba. Y el histórico
 * comprueba, además, que un evento ya escrito no admite `UPDATE` ni `DELETE`
 * ni siquiera con el dueño de la tabla (ADR-05).
 *
 * Sin `DATABASE_URL_PRUEBAS` se omite y lo dice; el verificador `--con-base`
 * la exige.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(4).toString('hex');
const bitacora: Bitacora = { registrar: () => undefined };

let escribe: Pool | undefined;
let lee: Pool | undefined;
let disponible = false;
let dispositivoId = '';
let viviendaId = '';

const version = (): VersionDeReglas => {
  const v = VersionDeReglas.crear(1, COP);
  if (!esExito(v)) throw new Error('versión inválida');
  return v.valor;
};

const acceso = (n: number): Acceso => {
  const hecho: HechoDeAcceso = {
    id: randomUUID(),
    copropiedadId: COP,
    ocurridoEn: new Date(),
    tipo: 'ingreso',
    metodo: 'placa',
    dispositivoId,
    viviendaId,
    placaDetectada: 'PER123',
    confianza: 0.95,
    claveIdempotencia: `persistencia-${CORRIDA}-${String(n)}`,
  };
  const a = Acceso.desdeDecision(hecho, permitir(version(), 'prueba.permite'));
  if (!esExito(a)) throw new Error(a.error.detalle);
  return a.valor;
};

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    escribe = new Pool({ connectionString: URL_BASE, max: 4 });
    lee = new Pool({ connectionString: URL_BASE, max: 4 });
    const c = await escribe.connect();
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        rol: 'superadministrador',
        usuario_id: ACTOR_INGESTA,
        copropiedad_id: null,
      }),
    ]);
    const d = await c.query<{ id: string }>(
      'SELECT id FROM public.dispositivos WHERE copropiedad_id = $1 LIMIT 1',
      [COP],
    );
    const v = await c.query<{ id: string }>(
      "SELECT id FROM public.viviendas WHERE copropiedad_id = $1 AND estado = 'activo' LIMIT 1",
      [COP],
    );
    c.release();
    dispositivoId = d.rows[0]?.id ?? '';
    viviendaId = v.rows[0]?.id ?? '';
    disponible = Boolean(dispositivoId && viviendaId);
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await escribe?.end();
  await lee?.end();
});

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS o sin semillas', () => disponible);
const omitida = (): boolean => !disponible;

describe('eventos · un acceso registrado sigue ahí tras «reiniciar», y no se altera', () => {
  it('lo anexa una instancia, lo lee otra, y UPDATE/DELETE fallan incluso como dueño', async () => {
    if (omitida()) return;
    const a = acceso(1);
    await new RepositorioEventosPgDeServicio(escribe as Pool).anexar(a, ACTOR_INGESTA);

    const leido = await new RepositorioEventosPgDeServicio(lee as Pool).porId(COP, a.id);
    expect(leido?.id).toBe(a.id);

    // ADR-05: la tabla es sólo de inserción también para el dueño (rol de la
    // cadena de conexión de pruebas), por REVOKE + disparador + RLS.
    const c = await (lee as Pool).connect();
    try {
      await c.query("SELECT set_config('request.jwt.claims', '', false)");
      await expect(
        c.query("UPDATE public.eventos SET placa_detectada = 'XXX000' WHERE id = $1", [a.id]),
      ).rejects.toThrow();
      await expect(c.query('DELETE FROM public.eventos WHERE id = $1', [a.id])).rejects.toThrow();
    } finally {
      c.release();
    }
  });
});

describe('alertas · persisten, incluidas las que nacen en la consola', () => {
  it('una alerta de evento se guarda con el instante del evento y se lee con otra instancia', async () => {
    if (omitida()) return;
    const a = acceso(2);
    await new RepositorioEventosPgDeServicio(escribe as Pool).anexar(a, ACTOR_INGESTA);
    const alerta = Alerta.abrir({
      id: randomUUID(),
      copropiedadId: COP,
      tipo: 'lista_negra',
      severidad: 'critica',
      generadaEn: new Date(),
      eventoId: a.id,
      dispositivoId,
      notas: `prueba ${CORRIDA}`,
    });
    if (!esExito(alerta)) throw new Error(alerta.error.detalle);
    await new RepositorioAlertasPg(escribe as Pool, bitacora).guardar(alerta.valor, ACTOR_INGESTA);

    const leida = await new RepositorioAlertasPg(lee as Pool, bitacora).porId(COP, alerta.valor.id);
    expect(leida?.tipo).toBe('lista_negra');
    expect(leida?.eventoId).toBe(a.id);
    expect(leida?.estado).toBe('abierta');
  });

  it('una emergencia desde la consola (sin evento ni equipo) persiste con su origen textual', async () => {
    if (omitida()) return;
    const alerta = Alerta.abrir({
      id: randomUUID(),
      copropiedadId: COP,
      tipo: 'panico',
      severidad: 'critica',
      generadaEn: new Date(),
      dispositivoId: 'consola-guardia',
      notas: `emergencia ${CORRIDA}`,
    });
    if (!esExito(alerta)) throw new Error(alerta.error.detalle);
    const escalada = alerta.valor.escalar(new Date());
    await new RepositorioAlertasPg(escribe as Pool, bitacora).guardar(escalada, ACTOR_INGESTA);

    // Por su id, y no entre «las 200 abiertas más recientes»: la base de
    // pruebas acumula alertas de otras suites con el reloj fijado en el
    // futuro, y ésta, fechada ahora, podía quedar fuera de la ventana.
    const mia = await new RepositorioAlertasPg(lee as Pool, bitacora).porId(COP, escalada.id);
    expect(mia?.estado).toBe('abierta');
    expect(mia?.dispositivoId).toBe('consola-guardia');
    expect(mia?.escaladaEn).not.toBeNull();
    expect(mia?.severidad).toBe('critica');
  });

  it('resolverla también persiste, y deja de estar entre las abiertas', async () => {
    if (omitida()) return;
    const alerta = Alerta.abrir({
      id: randomUUID(),
      copropiedadId: COP,
      tipo: 'dispositivo_caido',
      severidad: 'alta',
      generadaEn: new Date(),
      dispositivoId,
    });
    if (!esExito(alerta)) throw new Error(alerta.error.detalle);
    const repo = new RepositorioAlertasPg(escribe as Pool, bitacora);
    await repo.guardar(alerta.valor, ACTOR_INGESTA);
    const resuelta = alerta.valor.resolver(new Date(), 'equipo de vuelta');
    if (!esExito(resuelta)) throw new Error(resuelta.error.detalle);
    await repo.guardar(resuelta.valor, ACTOR_INGESTA);

    const otra = new RepositorioAlertasPg(lee as Pool, bitacora);
    expect((await otra.porId(COP, alerta.valor.id))?.estado).toBe('resuelta');
    expect((await otra.abiertasDe(COP)).some((x) => x.id === alerta.valor.id)).toBe(false);
  });
});

describe('A1 · A2 (15-N) · la caída se resuelve sola y la lista filtra por fecha, contra la base', () => {
  it('AlertasDelCicloDelEquipo resuelve la caída de ESE equipo y el filtro de fechas la acota', async () => {
    if (omitida()) return;
    const generada = new Date(Date.now() - 3_600_000);
    const alerta = Alerta.abrir({
      id: randomUUID(),
      copropiedadId: COP,
      tipo: 'dispositivo_caido',
      severidad: 'alta',
      generadaEn: generada,
      dispositivoId,
      notas: `caída ${CORRIDA}`,
    });
    if (!esExito(alerta)) throw new Error(alerta.error.detalle);
    const repo = new RepositorioAlertasPg(escribe as Pool, bitacora);
    await repo.guardar(alerta.valor, ACTOR_INGESTA);

    const antes = new Date(generada.getTime() - 1000);
    const despues = new Date(generada.getTime() + 1000);
    const enVentana = await repo.abiertasDe(COP, { dispositivoId, desde: antes, hasta: despues });
    expect(enVentana.map((a) => a.id)).toContain(alerta.valor.id);
    const fuera = await repo.abiertasDe(COP, { dispositivoId, desde: despues });
    expect(fuera.map((a) => a.id)).not.toContain(alerta.valor.id);

    const ciclo = new AlertasDelCicloDelEquipo(repo, { ahora: () => new Date() }, bitacora);
    expect(await ciclo.resolverCaida(COP, dispositivoId, 'sondeo', ACTOR_INGESTA)).toBeGreaterThan(
      0,
    );
    const leida = await new RepositorioAlertasPg(lee as Pool, bitacora).porId(COP, alerta.valor.id);
    expect(leida?.estado).toBe('resuelta');
    expect(leida?.notas).toContain(NOTA_DE_RESOLUCION_AUTOMATICA);
  });
});

describe('auditoría de seguridad · la respuesta del titular deja constancia', () => {
  it('escribe versión de la política, respuesta y origen en auditoria_seguridad', async () => {
    if (omitida()) return;
    const consentimientoId = randomUUID();
    const registro = new RegistroDeAuditoriaPg(escribe as Pool, bitacora);
    await registro.registrarRespuestaDeTitular({
      copropiedadId: COP,
      consentimientoId,
      respuesta: 'aceptado',
      versionPolitica: 'v1.0',
      ip: '203.0.113.7',
      userAgent: 'telefono-de-prueba',
    });
    const c = await (lee as Pool).connect();
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({
          rol: 'superadministrador',
          usuario_id: ACTOR_INGESTA,
          copropiedad_id: null,
        }),
      ]);
      const { rows } = await c.query<{
        tipo: string;
        recurso: string;
        ip: string;
        user_agent: string;
      }>(
        'SELECT tipo, recurso, host(ip) AS ip, user_agent FROM public.auditoria_seguridad WHERE identificador_solicitado = $1',
        [consentimientoId],
      );
      expect(rows[0]?.tipo).toBe('respuesta_de_titular');
      expect(rows[0]?.recurso).toBe('consentimiento/aceptado/politica:v1.0/canal:enlace');
      expect(rows[0]?.ip).toBe('203.0.113.7');
      expect(rows[0]?.user_agent).toBe('telefono-de-prueba');

      // D-10 · la presencial deja el canal y al operador que atendía la pantalla.
      const presencial = randomUUID();
      await registro.registrarRespuestaDeTitular({
        copropiedadId: COP,
        consentimientoId: presencial,
        respuesta: 'aceptado',
        versionPolitica: 'v1.0',
        ip: null,
        userAgent: null,
        canal: 'presencial',
        operadorId: ACTOR_INGESTA,
      });
      const { rows: p } = await c.query<{ recurso: string; usuario_id: string }>(
        'SELECT recurso, usuario_id FROM public.auditoria_seguridad WHERE identificador_solicitado = $1',
        [presencial],
      );
      expect(p[0]?.recurso).toBe('consentimiento/aceptado/politica:v1.0/canal:presencial');
      expect(p[0]?.usuario_id).toBe(ACTOR_INGESTA);
    } finally {
      c.release();
    }
  });

  it('un acceso cruzado con un usuario que no existe NO rompe la petición: se anota y sigue', async () => {
    if (omitida()) return;
    const avisos: string[] = [];
    const registro = new RegistroDeAuditoriaPg(escribe as Pool, {
      registrar: (_n, mensaje) => {
        avisos.push(mensaje);
      },
    });
    await expect(
      registro.registrarAccesoCruzado({
        usuarioId: randomUUID(),
        rol: 'portero',
        copropiedadSolicitada: COP,
        recurso: 'prueba',
      }),
    ).resolves.toBeUndefined();
    expect(avisos.some((m) => m.includes('auditoría'))).toBe(true);
  });
});
