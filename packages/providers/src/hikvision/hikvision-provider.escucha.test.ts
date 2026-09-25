import { describe, expect, it } from 'vitest';
import type { Reloj } from '@ncr/domain-core';
import { HikvisionProvider } from './hikvision-provider';
import { RegistroEnMemoria } from './registro-de-equipos';
import type { EquipoRegistrado } from './registro-de-equipos';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import type { IngestorDePublicaciones, PublicacionDeEquipo } from '../equipo/fuente-de-placas';
import { equiposSimulados } from '../simulacion/equipo-simulado';

/**
 * A4 (ETAPA 15-E) · LA LLAMADA DEL VIDEOPORTERO LLEGA A LA PLATAFORMA
 *
 * El equipo simulado emite por su flujo de eventos un bloque de llamada; el
 * proveedor lo escucha —por el transporte que la capacidad indique— y lo
 * publica en la MISMA fuente por la que entran las placas de la cámara. Al
 * otro lado, el ingestor de la API recibe un `llamada` con su origen. Lo que
 * esta prueba fija: un solo camino, y que la cámara no se escucha.
 */
const RELOJ: Reloj = { ahora: () => new Date('2026-09-25T12:00:00.000Z') };
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
const CAMARA = 'disp-camara';
const PORTERO = 'disp-portero';

const EQUIPOS: readonly EquipoRegistrado[] = [
  {
    dispositivoId: CAMARA,
    tipo: 'camara_lpr',
    host: '203.0.113.10',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
  },
  {
    dispositivoId: PORTERO,
    tipo: 'intercom',
    host: '203.0.113.12',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    canalDeAudioHabilitado: true,
    numeroDePuerta: 1,
  },
];

const LLAMADA = {
  eventType: 'videoIntercomEvent',
  currentEvent: true,
  dateTime: '2026-09-25T12:00:01-05:00',
  CallInfo: { buildingNumber: 2, unitNumber: 305 },
};

class IngestorEspia implements IngestorDePublicaciones {
  readonly recibidas: PublicacionDeEquipo[] = [];
  private avisar: (() => void) | null = null;
  readonly primera = new Promise<void>((listo) => {
    this.avisar = listo;
  });
  async ingerir(publicacion: PublicacionDeEquipo) {
    this.recibidas.push(publicacion);
    this.avisar?.();
    return { registrado: false, motivo: 'espía' };
  }
}

const montar = () => {
  const fuente = new FuenteDePlacas();
  const ingestor = new IngestorEspia();
  fuente.fijarIngestor(ingestor);
  const peticion = equiposSimulados({
    '203.0.113.10': { familia: 'camara', ...CREDENCIAL },
    '203.0.113.12': { familia: 'videoportero', ...CREDENCIAL, flujo: [LLAMADA] },
  });
  const proveedor = new HikvisionProvider({
    registro: new RegistroEnMemoria(EQUIPOS),
    reloj: RELOJ,
    fuente,
    peticion,
  });
  return { proveedor, ingestor };
};

describe('HikvisionProvider · escuchar (A4)', () => {
  it('la llamada del videoportero entra por la fuente compartida, con su origen', async () => {
    const { proveedor, ingestor } = montar();
    const escucha = await proveedor.escuchar(PORTERO);
    expect(escucha.transporte).not.toBe('ninguna');
    await Promise.race([
      ingestor.primera,
      new Promise((_, no) => setTimeout(() => no(new Error('la llamada no llegó')), 2000)),
    ]);
    escucha.detener();
    const llamada = ingestor.recibidas.find((p) => p.evento.clase === 'llamada');
    expect(llamada?.evento.dispositivoId).toBe(PORTERO);
    expect(llamada?.evento.unidadDeLlamada).toBe('305');
    expect(llamada?.evento.edificioDeLlamada).toBe('2');
    expect(['escucha', 'suscripcion']).toContain(llamada?.transporte);
  });

  it('la cámara NO se escucha: publica al servidor de alarma y no se le abre otro camino', async () => {
    const { proveedor } = montar();
    const escucha = await proveedor.escuchar(CAMARA);
    expect(escucha.transporte).toBe('ninguna');
    expect(escucha.detalle).toMatch(/servidor de alarma/);
  });
});
