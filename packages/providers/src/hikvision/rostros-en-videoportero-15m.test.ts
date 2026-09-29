import { describe, expect, it } from 'vitest';
import type { Bitacora, Reloj, Vigencia } from '@ncr/domain-core';
import { HikvisionProvider } from './hikvision-provider';
import { RegistroEnMemoria } from './registro-de-equipos';
import type { EquipoRegistrado } from './registro-de-equipos';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { equiposSimulados, plantillasPor } from '../simulacion/equipo-simulado';
import { personasPor } from '../simulacion/personas-simuladas';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';
import { identificadorEnElEquipo } from '../terminal/identificador-en-el-equipo';
import { RutaNoSoportada } from '../terminal/terminal-facial';
import { rostroDePrueba } from '../ensayo/rostro-de-prueba';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E3 / C2 (15-M) · EL VIDEOPORTERO RECONOCE VISITANTES COMO LA TERMINAL
 *
 * Decisión del cliente (29/09): el DS-KD9633 guarda los rostros de las
 * visitas. Lo que declara, según la evidencia de sitio: personas con
 * `userType` sólo `normal`, biblioteca con `post` y sin `setUp`, 3000 rostros.
 * El adaptador se gobierna por esas CAPACIDADES —nunca por el modelo—: alta
 * `normal` con la vigencia en `Valid` y carga por la operación declarada. La
 * terminal V4.61.0, que declara `visitor` y `setUp`, sigue como estaba.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
const RELOJ: Reloj = { ahora: () => new Date('2026-09-29T14:00:00.000Z') };
const VIGENCIA = {
  desde: new Date('2026-09-29T19:00:00.000Z'),
  hasta: new Date('2026-09-29T23:00:00.000Z'),
} as unknown as Vigencia;

const bitacora = (): Bitacora & { lineas: { mensaje: string; datos: unknown }[] } => {
  const lineas: { mensaje: string; datos: unknown }[] = [];
  return { lineas, registrar: (_n, mensaje, datos) => lineas.push({ mensaje, datos }) };
};

const montar = (host: string, tipo: EquipoRegistrado['tipo'], guion: Record<string, unknown>) => {
  const traza = bitacora();
  const peticion = equiposSimulados({
    [host]: {
      familia: tipo === 'terminal_facial' ? 'terminal' : 'videoportero',
      ...CREDENCIAL,
      ...guion,
    } as Parameters<typeof equiposSimulados>[0][string],
  });
  const proveedor = new HikvisionProvider({
    registro: new RegistroEnMemoria([
      {
        dispositivoId: 'equipo-1',
        tipo,
        host,
        puerto: 80,
        protocolo: 'http',
        ...CREDENCIAL,
        numeroDePuerta: 1,
        ...(tipo === 'terminal_facial' ? { modoDeTerminal: 'reporta_y_espera' as const } : {}),
      },
    ]),
    reloj: RELOJ,
    fuente: new FuenteDePlacas(),
    peticion,
    traza,
  });
  return { proveedor, traza };
};

const KD9633 = {
  bibliotecaEnVideoportero: true,
  tiposDePersona: 'normal',
  operacionesDeBiblioteca: 'post,delete,put,get',
  funcionesDePersonas: 'post,delete,put,get,setup,batchput',
  bibliotecaMaximo: 3000,
};

describe('E3 · el videoportero da de alta como DECLARA', () => {
  it('declara las capacidades de sitio: tipos, operaciones y 3000 rostros', async () => {
    const { proveedor } = montar('kd9633-capacidades.invalid', 'intercom', KD9633);
    const c = await proveedor.capacidadesDe('equipo-1');
    expect(c.tiposDePersona).toEqual(['normal']);
    expect(c.bibliotecaDeRostros).toMatchObject({
      estado: 'si',
      maximo: 3000,
      operaciones: ['post', 'delete', 'put', 'get'],
    });
  });

  it('alta `normal` con la vigencia en Valid, carga por POST, y baja verificada', async () => {
    const host = 'kd9633-alta.invalid';
    const { proveedor, traza } = montar(host, 'intercom', KD9633);
    await proveedor.sincronizar('equipo-1', 'visita-e3-1', jpegConMedidas(), VIGENCIA);

    const id = identificadorEnElEquipo('visita-e3-1');
    // En la hora de Bogotá: 14:00–17:59:59, sin desfase.
    expect(personasPor.get(host)?.get(id)).toEqual({
      tipo: 'normal',
      desde: '2026-09-29T14:00:00',
      hasta: '2026-09-29T17:59:59',
      puertas: [1],
    });
    expect(plantillasPor.get(host)?.has(id)).toBe(true);
    expect(traza.lineas.some((l) => /alta de persona/.test(l.mensaje))).toBe(true);

    await proveedor.suprimir('equipo-1', 'visita-e3-1');
    expect(plantillasPor.get(host)?.has(id)).toBe(false);
  });

  it('la terminal V4.61.0 que declara visitor y setUp sigue como estaba', async () => {
    const host = 'k1t344-v461.invalid';
    const { proveedor } = montar(host, 'terminal_facial', {
      firmware: 'V4.61.0',
      operacionesDeBiblioteca: 'post,delete,put,get,setUp',
    });
    await proveedor.sincronizar('equipo-1', 'visita-e3-2', jpegConMedidas(), VIGENCIA);
    const id = identificadorEnElEquipo('visita-e3-2');
    expect(personasPor.get(host)?.get(id)?.tipo).toBe('visitor');
    expect(plantillasPor.get(host)?.has(id)).toBe(true);
  });

  it('un equipo que no declara ni setUp ni post: RutaNoSoportada, y ni la persona se da de alta', async () => {
    const host = 'sin-carga.invalid';
    const { proveedor } = montar(host, 'intercom', {
      ...KD9633,
      operacionesDeBiblioteca: 'get,delete',
    });
    await expect(
      proveedor.sincronizar('equipo-1', 'visita-e3-3', jpegConMedidas(), VIGENCIA),
    ).rejects.toBeInstanceOf(RutaNoSoportada);
    expect(personasPor.get(host)?.size ?? 0).toBe(0);
    expect(plantillasPor.get(host)?.size ?? 0).toBe(0);
  });

  it('prueba negativa: forzar `visitor` en el videoportero lo rechaza el equipo (lo que pasaba antes)', async () => {
    const host = 'kd9633-visitor.invalid';
    // El equipo sigue admitiendo sólo `normal`; al adaptador se le quita lo
    // declarado, que es como daba de alta antes de la 15-M (`visitor`).
    const { proveedor } = montar(host, 'intercom', KD9633);
    const c = await proveedor.capacidadesDe('equipo-1');
    const sinTipos = { ...c } as Record<string, unknown>;
    delete sinTipos['tiposDePersona'];
    (proveedor as unknown as { capacidades: Map<string, unknown> }).capacidades.set(
      'equipo-1',
      sinTipos,
    );
    await expect(
      proveedor.sincronizar('equipo-1', 'visita-e3-4', jpegConMedidas(), VIGENCIA),
    ).rejects.toThrow();
    expect(plantillasPor.get(host)?.size ?? 0).toBe(0);
  });

  it('el paso de rostro del ensayo usa lo declarado: alta, búsqueda y baja en el DS-KD9633', async () => {
    const host = 'kd9633-ensayo.invalid';
    const { proveedor } = montar(host, 'intercom', KD9633);
    const capacidades = await proveedor.capacidadesDe('equipo-1');
    const r = await rostroDePrueba(
      {
        host,
        ...CREDENCIAL,
        peticion: (proveedor as unknown as { opciones: { peticion: typeof fetch } }).opciones
          .peticion,
      },
      jpegConMedidas(),
      'ENSAYOE3',
      0,
      async () => undefined,
      capacidades,
    );
    expect(r.rechazo).toBeNull();
    expect(r.aceptada).toBe(true);
    expect(r.seguiaTrasLaEspera).toBe(true);
    expect(r.errorDeSupresion).toBeNull();
    expect(plantillasPor.get(host)?.size ?? 0).toBe(0);
  });
});
