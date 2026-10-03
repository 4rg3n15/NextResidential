import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Acceso, Alerta, VersionDeReglas, esExito, negar, permitir } from '@ncr/domain-core';
import type { HechoDeAcceso, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../src/autenticacion';
import { RepositorioDeEquiposPg } from '../src/equipos/infraestructura/repositorio-equipos-pg';
import type { ResultadoDeSondeo } from '../src/equipos';
import { RepositorioEventosPgDeServicio } from '../src/eventos/infraestructura/repositorio-eventos-pg-de-servicio';
import { RepositorioTableroPg } from '../src/tablero/infraestructura/repositorio-tablero-pg';
import { RepositorioAlertasPg } from '../src/eventos/infraestructura/repositorio-alertas-pg';
import { ACTOR_INGESTA } from '../src/comun/actores-de-servicio';
import {
  ConsultarAccesosPorHora,
  ConsultarDispositivos,
  ConsultarIndicadores,
} from '../src/tablero/aplicacion/casos-de-uso';
import { URL_BASE, exigirBase as guardianDeLaBase } from './base-exigida';
import { copropiedadDeLaCorrida, equipoPropio } from './copropiedad-propia';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-02 · EL TABLERO Y LA PANTALLA DE DISPOSITIVOS CONTRA BASE REAL
 *
 * En sitio, el 26/09/2026, un equipo dado de alta no aparecía en Dispositivos:
 * el módulo del tablero leía SIEMPRE el doble en memoria, y
 * `RepositorioTableroPg` —escrito en la ETAPA 06— no se había ejecutado nunca.
 * Tampoco habría funcionado: consultaba el `Pool` sin claims y, con la RLS
 * forzada, eso son cero filas sin un solo error.
 *
 * Aquí se ejerce por los tres casos de uso que sirven la consola, contra la
 * base migrada, con la RLS forzada y los claims de servicio por copropiedad.
 * Un equipo `rechazado` («decide solo», H-SITIO-01) TIENE que salir: es el que
 * más urge corregir desde su ficha.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const LLAVE = 'llave-de-equipos-solo-para-pruebas-32+';
const CORRIDA = randomBytes(3).toString('hex');
/**
 * El puerto varía por corrida: `dispositivos_endpoint_uk` es único por
 * (copropiedad, host, puerto) entre los activos y la base de pruebas conserva
 * los equipos de corridas anteriores (la de registro-de-equipos-pg chocó así).
 */
const PUERTO = 1024 + (parseInt(CORRIDA, 16) % 60_000);

/**
 * El rol con el que se conecta la API en Supabase: dueño de las tablas y NO
 * superusuario (ADR-05). `DATABASE_URL_PRUEBAS` entra como `postgres`, que en
 * este clúster SÍ es superusuario y se salta la RLS aunque esté forzada: con él
 * la prueba pasaría también sin claims. `verificar.sh --modo-supabase` crea
 * este rol precisamente para demostrar la RLS por ejecución.
 */
const ROL_DE_LA_API = 'sb_postgres_sim';

let semillas: Pool | undefined;
let pool: Pool | undefined;
let disponible = false;
let actorId = '';
let viviendaId = '';

const reloj: Reloj = { ahora: () => new Date() };

const ctxAdmin = (copropiedadId: string): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'administrador',
  copropiedadId,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});

const VERIFICADO: ResultadoDeSondeo = {
  clase: 'alcanzado',
  detalle: 'responde',
  modelo: 'MODELO-DE-PRUEBA',
  firmware: 'V0',
  latenciaMs: 3,
  verificado: true,
};

const DECIDE_SOLO: ResultadoDeSondeo = {
  clase: 'decide_solo',
  detalle: 'la cámara abre la barrera por su cuenta',
  modelo: 'CAMARA-DE-PRUEBA',
  firmware: 'V5',
  latenciaMs: 4,
  verificado: false,
};

const alta = (nombre: string, tipo: 'intercom' | 'camara_lpr', octeto: number) => ({
  nombre,
  tipo,
  host: `198.51.100.${String(octeto)}`,
  puerto: PUERTO,
  protocolo: 'http' as const,
  usuario: 'servicio',
  secreto: `clave-${CORRIDA}`,
  canalDeAudioHabilitado: false,
});

const version = (copropiedadId: string): VersionDeReglas => {
  const v = VersionDeReglas.crear(1, copropiedadId);
  if (!esExito(v)) throw new Error('versión de prueba inválida');
  return v.valor;
};

let secuencia = 0;
const acceso = (dispositivoId: string, permitido: boolean): Acceso => {
  secuencia += 1;
  const hecho: HechoDeAcceso = {
    id: crypto.randomUUID(),
    copropiedadId: COP_A,
    ocurridoEn: new Date(),
    tipo: permitido ? 'ingreso' : 'denegado',
    metodo: 'placa',
    dispositivoId,
    viviendaId,
    placaDetectada: 'ABC123',
    confianza: 0.97,
    claveIdempotencia: `tablero-pg-${CORRIDA}-${secuencia}`,
  };
  const decision = permitido
    ? permitir(version(COP_A), 'prueba.permite')
    : negar('VIGENCIA_EXPIRADA', version(COP_A), 'prueba.niega');
  const a = Acceso.desdeDecision(hecho, decision);
  if (!esExito(a)) throw new Error(`hecho de prueba inválido: ${a.error.detalle}`);
  return a.valor;
};

beforeAll(async () => {
  if (URL_BASE === undefined) return;
  semillas = new Pool({ connectionString: URL_BASE, max: 2 });
  try {
    const c = await semillas.connect();
    const rol = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROL_DE_LA_API]);
    if (rol.rowCount === 0) {
      c.release();
      return;
    }
    pool = new Pool({ connectionString: URL_BASE, max: 4, options: `-c role=${ROL_DE_LA_API}` });
    const u = await c.query<{ id: string }>(
      `SELECT u.id FROM public.usuarios u JOIN public.roles_usuario r ON r.usuario_id = u.id
        WHERE r.copropiedad_id = $1 AND r.rol = 'administrador' LIMIT 1`,
      [COP_A],
    );
    const v = await c.query<{ id: string }>(
      "SELECT id FROM public.viviendas WHERE copropiedad_id = $1 AND estado = 'activo' LIMIT 1",
      [COP_A],
    );
    c.release();
    actorId = u.rows[0]?.id ?? '';
    viviendaId = v.rows[0]?.id ?? '';
    disponible = actorId !== '' && viviendaId !== '';
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
  await semillas?.end();
});

const exigirBase = (): Pool => {
  if (pool === undefined) {
    throw new Error(
      `la base de pruebas no tiene el rol ${ROL_DE_LA_API}: prepárela con ` +
        './supabase/verificar.sh --con-semillas --modo-supabase',
    );
  }
  if (!disponible) {
    throw new Error('la base de pruebas no tiene las semillas (administrador y vivienda de COP_A)');
  }
  return pool;
};

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
guardianDeLaBase('sin el rol de la API o sin las semillas', () => disponible);

describe.skipIf(URL_BASE === undefined)('H-SITIO-02 · tablero contra base real', () => {
  it('un equipo dado de alta —verificado o «decide solo»— aparece en Dispositivos', async () => {
    const p = exigirBase();
    const equipos = new RepositorioDeEquiposPg(p, LLAVE, 'env:EQUIPOS_LLAVE');
    const octeto = 10 + (parseInt(CORRIDA, 16) % 200);
    const bueno = await equipos.crear(
      ctxAdmin(COP_A),
      COP_A,
      alta(`Portero ${CORRIDA}`, 'intercom', octeto),
      VERIFICADO,
    );
    const camara = await equipos.crear(
      ctxAdmin(COP_A),
      COP_A,
      alta(`Cámara que decide sola ${CORRIDA}`, 'camara_lpr', octeto + 1),
      DECIDE_SOLO,
    );
    expect(camara.verificacion).toBe('rechazado');

    const consulta = new ConsultarDispositivos(new RepositorioTableroPg(p), reloj);
    const { dispositivos } = await consulta.ejecutar(COP_A);
    const ids = dispositivos.map((d) => d.id);
    expect(ids).toContain(bueno.id);
    expect(ids).toContain(camara.id);

    const fila = dispositivos.find((d) => d.id === camara.id);
    expect(fila?.modelo).toBe('CAMARA-DE-PRUEBA');
    expect(fila?.tipo).toBe('camara_lpr');
    // Sin latido todavía: el tablero no lo inventa.
    expect(fila?.ultimoLatido).toBeNull();
    // Y la ficha, la edición y las correcciones lo encuentran por el mismo id.
    const inventario = await equipos.listar(ctxAdmin(COP_A), COP_A);
    expect(inventario.find((e) => e.id === camara.id)?.verificacion).toBe('rechazado');
  });

  it('sin claims, la RLS forzada devuelve CERO filas: por eso el adaptador los fija', async () => {
    const p = exigirBase();
    // La misma consulta que el adaptador, a pelo. Es el defecto de antes de
    // H-SITIO-02: ni un error, sólo una pantalla vacía.
    // Conexión NUEVA: los repositorios que fijan los claims con alcance de
    // sesión los dejan pegados a la conexión del pool (ver el informe 15-K).
    const aPelo = new Pool({
      connectionString: URL_BASE,
      max: 1,
      options: `-c role=${ROL_DE_LA_API}`,
    });
    try {
      const { rows } = await aPelo.query(
        "SELECT id FROM public.dispositivos WHERE copropiedad_id = $1 AND estado = 'activo'",
        [COP_A],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await aPelo.end();
    }
    const conClaims = await new ConsultarDispositivos(new RepositorioTableroPg(p), reloj).ejecutar(
      COP_A,
    );
    expect(conClaims.dispositivos.length).toBeGreaterThan(0);
  });

  it('los equipos de OTRA copropiedad no se cuelan: los claims son por copropiedad', async () => {
    const p = exigirBase();
    const consulta = new ConsultarDispositivos(new RepositorioTableroPg(p), reloj);
    const deA = new Set((await consulta.ejecutar(COP_A)).dispositivos.map((d) => d.id));
    const deB = (await consulta.ejecutar(COP_B)).dispositivos.map((d) => d.id);
    expect(deB.some((id) => deA.has(id))).toBe(false);
  });

  it('los indicadores leen el padrón sembrado: sin claims serían todos cero', async () => {
    const p = exigirBase();
    const indicadores = await new ConsultarIndicadores(new RepositorioTableroPg(p), reloj).ejecutar(
      COP_A,
    );
    // La semilla trae residentes y vehículos activos en COP_A. Un cero aquí es
    // exactamente el síntoma de la RLS forzada sin claims.
    expect(indicadores.padron.residentesActivos).toBeGreaterThan(0);
    expect(indicadores.padron.vehiculosActivos).toBeGreaterThan(0);
    expect(indicadores.ventana.zonaHoraria).toBe('America/Bogota');
    expect(indicadores.alertas.pendientes).toBeGreaterThanOrEqual(0);
  });

  it('otros fallos (15-M) · una alerta archivada deja de contar como pendiente', async () => {
    const p = exigirBase();
    const tablero = new RepositorioTableroPg(p);
    const alertas = new RepositorioAlertasPg(p, { registrar: () => undefined });
    // H-15M-C01 · copropiedad PROPIA: en COP_A otras suites abren y resuelven
    // alertas en paralelo, y el conteo exacto sólo vale donde nadie más las abre.
    const propia = await copropiedadDeLaCorrida(semillas as Pool, CORRIDA);
    const equipos = new RepositorioDeEquiposPg(p, LLAVE, 'env:EQUIPOS_LLAVE');
    const dispositivoId = await equipoPropio(equipos, propia, CORRIDA);
    const copropiedadId = propia.id;
    expect((await tablero.conteosDeAlertas(copropiedadId)).pendientes).toBe(0);
    const alerta = Alerta.abrir({
      id: randomUUID(),
      copropiedadId,
      tipo: 'acceso_dudoso',
      severidad: 'informativa',
      generadaEn: new Date(),
      dispositivoId,
      notas: `ruido de prueba ${CORRIDA}`,
    });
    if (!esExito(alerta)) throw new Error(alerta.error.detalle);
    await alertas.guardar(alerta.valor, ACTOR_INGESTA);
    expect((await tablero.conteosDeAlertas(copropiedadId)).pendientes).toBe(1);
    const archivadas = await alertas.archivar(
      copropiedadId,
      [alerta.valor.id],
      'ruido de prueba',
      ACTOR_INGESTA,
      new Date(),
    );
    expect(archivadas).toBe(1);
    expect((await tablero.conteosDeAlertas(copropiedadId)).pendientes).toBe(0);
  });

  it('los accesos por hora cuentan los eventos del día en la hora LOCAL del conjunto', async () => {
    const p = exigirBase();
    const equipos = new RepositorioDeEquiposPg(p, LLAVE, 'env:EQUIPOS_LLAVE');
    const inventario = await equipos.listar(ctxAdmin(COP_A), COP_A);
    const dispositivoId = inventario[0]?.id;
    if (dispositivoId === undefined) throw new Error('COP_A no tiene ningún equipo');

    const consulta = new ConsultarAccesosPorHora(new RepositorioTableroPg(p), reloj);
    const antes = await consulta.ejecutar(COP_A);
    const eventos = new RepositorioEventosPgDeServicio(p);
    await eventos.anexar(acceso(dispositivoId, true), actorId);
    await eventos.anexar(acceso(dispositivoId, true), actorId);
    await eventos.anexar(acceso(dispositivoId, false), actorId);
    const despues = await consulta.ejecutar(COP_A);

    expect(despues.franjas).toHaveLength(24);
    /**
     * «Al menos», no «exactamente»: COP_A es la copropiedad sembrada y otras
     * suites anexan eventos en ella EN PARALELO (la corrida final de la 15-K lo
     * enseñó: esperaba 2 y vio 7). Los eventos sólo se añaden, así que el
     * delta nunca baja de lo que esta prueba anexó. La propiedad que importa
     * —la hora LOCAL— se sigue cazando: si la franja se calculara en UTC, estos
     * eventos y los de las demás suites caerían cinco franjas más allá y la
     * franja local no crecería.
     */
    const suma = (x: typeof antes, k: 'permitidos' | 'negados'): number =>
      x.franjas.reduce((t, f) => t + f[k], 0);
    expect(suma(despues, 'permitidos') - suma(antes, 'permitidos')).toBeGreaterThanOrEqual(2);
    expect(suma(despues, 'negados') - suma(antes, 'negados')).toBeGreaterThanOrEqual(1);

    const horaLocal = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone: 'America/Bogota',
      }).format(new Date()),
    );
    const franja = despues.franjas[horaLocal];
    const previa = antes.franjas[horaLocal];
    expect((franja?.permitidos ?? 0) - (previa?.permitidos ?? 0)).toBeGreaterThanOrEqual(2);
  });
});
