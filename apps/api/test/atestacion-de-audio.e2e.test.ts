import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { ResultadoDeSondeo } from '../src/equipos';
import { RepositorioDeEquiposEnMemoria } from '../src/equipos/infraestructura/repositorio-equipos-en-memoria';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CORRECCIÓN 15-S1 · B.1 · LA ATESTACIÓN DE AUDIO, TAMBIÉN PARA LA TERMINAL (API)
 *
 * La guardia habla por la terminal facial igual que por el videoportero; la
 * compuerta es la casilla «comprobé en sitio que el equipo abre el canal de
 * audio». La API no la restringía por tipo (ni el DTO ni el controlador): esto
 * lo FIJA para la terminal, en el alta y en la edición, para que nadie la
 * restrinja sin ver esta prueba en rojo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
let app: INestApplication;
afterEach(async () => {
  await app?.close();
});

const ALCANZADO: ResultadoDeSondeo = {
  clase: 'alcanzado',
  detalle: 'El equipo responde y acepta la credencial',
  modelo: 'DS-K1T344MBFWX-E1',
  firmware: 'V4.61.0',
  latenciaMs: 30,
  verificado: true,
};

const TERMINAL = {
  nombre: 'Terminal de la portería',
  tipo: 'terminal_facial' as const,
  host: '203.0.113.20',
  puerto: 80,
  protocolo: 'http' as const,
  usuario: 'servicio_ncr',
  secreto: 'una-clave-que-no-debe-volver',
  numeroDePuerta: 1,
  modoDeTerminal: 'reporta_y_espera' as const,
};

describe('15-S1 · B.1 · la terminal guarda la atestación de audio', () => {
  it('en el alta y en la edición, marcada y desmarcada', async () => {
    const firmante = await crearFirmante();
    app = await crearApp(firmante, undefined, undefined, {
      repositorio: new RepositorioDeEquiposEnMemoria(),
      sonda: { probar: async () => ALCANZADO },
    });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const alta = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...TERMINAL, canalDeAudioHabilitado: true });
    expect(alta.status, JSON.stringify(alta.body)).toBe(201);
    expect(alta.body).toMatchObject({ tipo: 'terminal_facial', canalDeAudioHabilitado: true });

    const edicion = await request(app.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${String(alta.body.id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: TERMINAL.nombre, tipo: TERMINAL.tipo, canalDeAudioHabilitado: false });
    expect(edicion.status, JSON.stringify(edicion.body)).toBe(200);
    expect(edicion.body.canalDeAudioHabilitado).toBe(false);
  });
});
