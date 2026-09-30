import { describe, expect, it } from 'vitest';
import type { Reloj } from '@ncr/domain-core';
import { HikvisionProvider } from '../hikvision/hikvision-provider';
import { RegistroEnMemoria } from '../hikvision/registro-de-equipos';
import { equiposSimulados } from '../simulacion/equipo-simulado';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * O1 (15-N) · DT-15M-06 · LA BARRERA QUE RECHAZA NO «NO RESPONDIÓ»
 *
 * La barrera ya distinguía `rechazada` de `inalcanzable`; el adaptador lo
 * reducía a `aceptado: false` y la API lo leía como «el equipo no respondió».
 * Se corrige SÓLO la clasificación del resultado: la orden que sale hacia la
 * cámara es la misma (la regresión del 28/09 sigue verde sin tocarla).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const RELOJ: Reloj = { ahora: () => new Date('2026-09-30T12:00:00.000Z') };
const CAMARA = 'disp-camara-o1';
/** RFC 5737 · rango de DOCUMENTACIÓN: no es la dirección de nadie. */
const HOST = '203.0.113.21';

const proveedorCon = (peticion: typeof fetch): HikvisionProvider =>
  new HikvisionProvider({
    registro: new RegistroEnMemoria([
      {
        dispositivoId: CAMARA,
        tipo: 'camara_lpr',
        host: HOST,
        puerto: 80,
        protocolo: 'http',
        usuario: 'servicio',
        clave: 'clave-de-prueba',
      },
    ]),
    reloj: RELOJ,
    peticion,
  });

const camara = (guion: Record<string, unknown> = {}): typeof fetch =>
  equiposSimulados({
    [HOST]: { familia: 'camara', usuario: 'servicio', clave: 'clave-de-prueba', ...guion },
  });

describe('O1 · la barrera que rechaza la orden', () => {
  it('rechazo del equipo: no aceptado, CON el motivo del rechazo', async () => {
    const r = await proveedorCon(camara({ aperturaSinConfirmar: true })).abrir(CAMARA, 'op');
    expect(r.aceptado).toBe(false);
    expect(r.rechazo).toMatch(/no aceptó la orden/);
  });

  it('aceptada: sin motivo de rechazo', async () => {
    const r = await proveedorCon(camara()).abrir(CAMARA, 'op');
    expect(r.aceptado).toBe(true);
    expect(r.rechazo).toBeUndefined();
  });

  it('inalcanzable: no aceptado y SIN motivo de rechazo (sigue siendo «no respondió»)', async () => {
    const sinRed = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const r = await proveedorCon(sinRed).abrir(CAMARA, 'op');
    expect(r.aceptado).toBe(false);
    expect(r.rechazo).toBeUndefined();
  });
});
