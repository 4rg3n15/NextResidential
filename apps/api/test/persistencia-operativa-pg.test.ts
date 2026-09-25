import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Acceso, Alerta, VersionDeReglas, esExito, permitir } from '@ncr/domain-core';
import type { Bitacora, HechoDeAcceso } from '@ncr/domain-core';
import { ACTOR_INGESTA } from '../src/comun/actores-de-servicio';
import { RepositorioEventosPgDeServicio } from '../src/eventos/infraestructura/repositorio-eventos-pg-de-servicio';
import { RepositorioAlertasPg } from '../src/eventos/infraestructura/repositorio-alertas-pg';
import { BitacoraDeOrdenesPg } from '../src/guardia/infraestructura/bitacora-de-ordenes-pg';
import { RegistroDeAuditoriaPg } from '../src/comun/auditoria/auditoria-pg';
import type { OrdenEjecutada } from '../src/guardia/aplicacion/apertura-manual';

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
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(4).toString('hex');
const bitacora: Bitacora = { registrar: () => undefined };

let escribe: Pool | undefined;
let lee: Pool | undefined;
let disponible = false;
let operadorId = '';
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
    const u = await c.query<{ id: string }>(
      "SELECT u.id FROM public.usuarios u JOIN public.roles_usuario r ON r.usuario_id = u.id WHERE u.copropiedad_id = $1 AND r.rol IN ('portero','administrador') LIMIT 1",
      [COP],
    );
    const d = await c.query<{ id: string }>(
      'SELECT id FROM public.dispositivos WHERE copropiedad_id = $1 LIMIT 1',
      [COP],
    );
    const v = await c.query<{ id: string }>(
      "SELECT id FROM public.viviendas WHERE copropiedad_id = $1 AND estado = 'activo' LIMIT 1",
      [COP],
    );
    c.release();
    operadorId = u.rows[0]?.id ?? '';
    dispositivoId = d.rows[0]?.id ?? '';
    viviendaId = v.rows[0]?.id ?? '';
    disponible = Boolean(operadorId && dispositivoId && viviendaId);
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await escribe?.end();
  await lee?.end();
});

const omitida = (): boolean => {
  if (disponible) return false;
  console.warn('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas (se exige con --con-base).');
  return true;
};

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

    const abiertas = await new RepositorioAlertasPg(lee as Pool, bitacora).abiertasDe(COP);
    const mia = abiertas.find((x) => x.id === escalada.id);
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

describe('órdenes manuales · el rastro de RN-08 sobrevive a un reinicio', () => {
  it('registrar, anotar el desenlace y leer las últimas con otra instancia', async () => {
    if (omitida()) return;
    const orden: OrdenEjecutada = {
      id: randomUUID(),
      copropiedadId: COP,
      accion: 'abrir',
      motivo: `Visitante confirmado por teléfono ${CORRIDA}`,
      operadorId,
      rol: 'portero',
      dispositivoId,
      momento: new Date(),
      eventoId: null,
    };
    const a = new BitacoraDeOrdenesPg(escribe as Pool);
    await a.registrar(orden);
    await a.anotarResultado(COP, orden.id, 'aceptada', 'relé en 120 ms');

    const ultimas = await new BitacoraDeOrdenesPg(lee as Pool).ultimas(COP, 20);
    const mia = ultimas.find((o) => o.id === orden.id);
    expect(mia?.motivo).toBe(orden.motivo);
    expect(mia?.resultado).toBe('aceptada');
    expect(mia?.detalle).toBe('relé en 120 ms');
    expect(mia?.rol).toBe('portero');
  });

  it('las órdenes no se borran: DELETE falla por disparador', async () => {
    if (omitida()) return;
    const c = await (lee as Pool).connect();
    try {
      await c.query("SELECT set_config('request.jwt.claims', '', false)");
      await expect(
        c.query('DELETE FROM public.ordenes_manuales WHERE copropiedad_id = $1', [COP]),
      ).rejects.toThrow();
    } finally {
      c.release();
    }
  });
});

describe('auditoría de seguridad · la respuesta del titular deja constancia', () => {
  it('escribe versión de la política, respuesta y origen en auditoria_seguridad', async () => {
    if (omitida()) return;
    const consentimientoId = randomUUID();
    await new RegistroDeAuditoriaPg(escribe as Pool, bitacora).registrarRespuestaDeTitular({
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
      expect(rows[0]?.recurso).toBe('consentimiento/aceptado/politica:v1.0');
      expect(rows[0]?.ip).toBe('203.0.113.7');
      expect(rows[0]?.user_agent).toBe('telefono-de-prueba');
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
