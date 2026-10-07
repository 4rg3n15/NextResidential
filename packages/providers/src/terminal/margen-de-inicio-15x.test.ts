import { describe, expect, it } from 'vitest';
import { Vigencia } from '@ncr/domain-core';
import { TerminalFacial } from './terminal-facial';
import { MARGEN_DE_INICIO_S, personaEnElEquipo } from './persona-en-el-equipo';
import { identificadorEnElEquipo } from './identificador-en-el-equipo';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';
import { negacionesLocalesPor } from '../simulacion/personas-simuladas';
import { FlujoEnVivo } from '../simulacion/verificacion-remota-simulada';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D0 · «PERMISO VENCIDO» A QUIEN LLEGA A SU HORA (sitio, 06/10)
 *
 * La terminal decide la vigencia con SU reloj antes de preguntar. La visita de
 * las 09:00 en Bogotá, con el equipo dos minutos atrasado, llegaba a las «08:58»
 * del equipo: antes de `beginTime`, y el equipo negaba por su cuenta. Con el
 * margen de inicio pregunta, y decide la plataforma con la vigencia verdadera.
 * El margen está ACOTADO: un segundo antes de él, el equipo sigue negando.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const VISITA = (() => {
  const r = Vigencia.crear(new Date('2026-09-27T14:00:00Z'), new Date('2026-09-27T18:00:00Z'));
  if (!r.ok) throw new Error(r.error.detalle);
  return r.valor;
})(); // 09:00–13:00 en Bogotá
const PLANTILLA = '5e2b7c1a-0000-4000-8000-0000000000d0';
const EN_EL_EQUIPO = identificadorEnElEquipo(PLANTILLA);
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

describe('15-X · D0 · el inicio con margen, en el registro', () => {
  it(`beginTime es desde − ${String(MARGEN_DE_INICIO_S)} s; el fin no cambia`, () => {
    expect(MARGEN_DE_INICIO_S).toBe(300);
    expect(personaEnElEquipo('p7', VISITA, null).Valid).toMatchObject({
      beginTime: '2026-09-27T08:55:00',
      endTime: '2026-09-27T12:59:59',
    });
  });

  it('el margen se puede ajustar por equipo, y 0 deja el inicio exacto', () => {
    expect(personaEnElEquipo('p7', VISITA, null, { margenDeInicioS: 60 }).Valid).toMatchObject({
      beginTime: '2026-09-27T08:59:00',
    });
    expect(personaEnElEquipo('p7', VISITA, null, { margenDeInicioS: 0 }).Valid).toMatchObject({
      beginTime: '2026-09-27T09:00:00',
    });
  });
});

/** La terminal simulada recuerda la vigencia y decide en local con la hora del evento. */
const llegaA = async (destino: string, horaDelEquipo: string, serie: number) => {
  const flujo = new FlujoEnVivo();
  const simulado = equipoSimulado({ familia: 'terminal', ...CREDENCIAL, destino, enVivo: flujo });
  const conexion = { host: destino, puerto: 80, protocolo: 'http', ...CREDENCIAL } as const;
  const terminal = new TerminalFacial({
    ...conexion,
    peticion: simulado,
    modo: 'reporta_y_espera',
    numeroDePuerta: 1,
  });
  await terminal.sincronizar('t', PLANTILLA, jpegConMedidas(), VISITA);
  const ruta = rutaPara('escuchar los eventos que el equipo emite', 'terminal');
  const control = new AbortController();
  const abierto = await new ClienteDeEquipo({
    ...conexion,
    peticion: simulado,
  }).abrirFlujoDeEventos(ruta.ruta, control.signal);
  flujo.emitir({
    eventType: 'AccessControllerEvent',
    dateTime: horaDelEquipo,
    AccessControllerEvent: {
      majorEventType: 5,
      subEventType: 75,
      employeeNoString: EN_EL_EQUIPO,
      serialNo: serie,
      remoteCheck: true,
    },
  });
  const { value } = await abierto.trozos[Symbol.asyncIterator]().next();
  control.abort();
  return JSON.parse(new TextDecoder().decode(value as Uint8Array)) as {
    AccessControllerEvent: Record<string, unknown>;
  };
};

describe('15-X · D0 · el equipo atrasado ya no niega por su cuenta a quien llega a su hora', () => {
  it('a las «08:58» del equipo (dos minutos atrasado) PREGUNTA a la plataforma', async () => {
    const e = await llegaA('203.0.113.91', '2026-09-27T08:58:00-05:00', 91);
    expect(e.AccessControllerEvent['remoteCheck']).toBe(true);
    expect(negacionesLocalesPor.get('203.0.113.91') ?? []).toEqual([]);
  });

  it('el primer segundo del margen, «08:55:00», también pregunta', async () => {
    const e = await llegaA('203.0.113.92', '2026-09-27T08:55:00-05:00', 92);
    expect(e.AccessControllerEvent['remoteCheck']).toBe(true);
  });

  it('el margen está acotado: a las «08:54:59» el equipo sigue negando en local', async () => {
    const e = await llegaA('203.0.113.93', '2026-09-27T08:54:59-05:00', 93);
    expect(e.AccessControllerEvent['remoteCheck']).toBeUndefined();
    expect(e.AccessControllerEvent['subEventType']).toBe(76);
    expect(negacionesLocalesPor.get('203.0.113.93')).toEqual([`${EN_EL_EQUIPO}:fuera_de_vigencia`]);
  });
});
