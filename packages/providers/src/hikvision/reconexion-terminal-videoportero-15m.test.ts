import { describe, expect, it } from 'vitest';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { HikvisionProvider } from './hikvision-provider';
import { RegistroEnMemoria } from './registro-de-equipos';
import type { EquipoRegistrado } from './registro-de-equipos';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { diagnosticarEquipo } from '../diagnostico/diagnostico-de-equipo';
import { desafiosPor, equiposSimulados, plantillasPor } from '../simulacion/equipo-simulado';
import { FlujoEnVivo } from '../simulacion/verificacion-remota-simulada';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C8 (15-M) · LA TERMINAL Y EL VIDEOPORTERO, RECONECTADOS DE PUNTA A PUNTA
 *
 * Los dos equipos del 28/09, tal como se comportaron: la terminal contesta
 * `401` SIN desafío al nonce caducado; el videoportero, `401` con
 * `stale="false"`. El nonce dura 5 s y entre paso y paso pasan 9 y 35 s, con
 * la escucha larga ABIERTA (la que en sitio negociaba el nonce que las demás
 * peticiones heredaban). Sondeo, escucha, apertura remota, alta y baja de
 * rostro: todo entra, el equipo nunca ve un resumen malo y la bitácora no
 * dice «credencial» ni una vez. La verificación remota con las piezas de
 * producción está en `ensayo/paso-de-verificacion.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
const TERMINAL = { id: 'terminal-1', host: 'terminal-c8.invalid' };
const PORTERO = { id: 'portero-1', host: 'portero-c8.invalid' };

const relojManual = (): { ahora: () => number; avanzar: (ms: number) => void } => {
  let t = Date.UTC(2026, 8, 29, 14, 0, 0);
  return { ahora: () => t, avanzar: (ms) => (t += ms) };
};

const bitacora = (): Bitacora & { lineas: { nivel: string; mensaje: string }[] } => {
  const lineas: { nivel: string; mensaje: string }[] = [];
  return { lineas, registrar: (nivel, mensaje) => lineas.push({ nivel, mensaje }) };
};

const registro = (): readonly EquipoRegistrado[] => [
  {
    dispositivoId: TERMINAL.id,
    tipo: 'terminal_facial',
    host: TERMINAL.host,
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    modoDeTerminal: 'reporta_y_espera',
    numeroDePuerta: 1,
  },
  {
    dispositivoId: PORTERO.id,
    tipo: 'intercom',
    host: PORTERO.host,
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    canalDeAudioHabilitado: true,
    numeroDePuerta: 1,
  },
];

const montar = () => {
  const reloj = relojManual();
  const traza = bitacora();
  const enVivo = { terminal: new FlujoEnVivo(), portero: new FlujoEnVivo() };
  const peticion = equiposSimulados({
    [TERMINAL.host]: {
      familia: 'terminal',
      ...CREDENCIAL,
      enVivo: enVivo.terminal,
      nonce: { vigenciaMs: 5_000, alVencer: 'sin_desafio', ahora: reloj.ahora },
    },
    [PORTERO.host]: {
      familia: 'videoportero',
      ...CREDENCIAL,
      enVivo: enVivo.portero,
      bibliotecaEnVideoportero: true,
      nonce: { vigenciaMs: 5_000, alVencer: 'stale_false', ahora: reloj.ahora },
    },
  });
  const relojDelProveedor: Reloj = { ahora: () => new Date(reloj.ahora()) };
  const proveedor = new HikvisionProvider({
    registro: new RegistroEnMemoria(registro()),
    reloj: relojDelProveedor,
    fuente: new FuenteDePlacas(),
    peticion,
    traza,
  });
  return { reloj, traza, peticion, proveedor, enVivo };
};

const sinCredencialEnLaBitacora = (traza: { lineas: { mensaje: string }[] }): void => {
  const sospechosas = traza.lineas.filter((l) =>
    /credencial|usuario o clave|BLOQUEADA/i.test(l.mensaje),
  );
  expect(sospechosas).toEqual([]);
};

describe('C8 · reconexión completa con la escucha abierta y el nonce que caduca', () => {
  it.each([
    ['la terminal (401 sin desafío al nonce caducado)', TERMINAL, 'terminal' as const],
    ['el videoportero (stale="false" al nonce caducado)', PORTERO, 'videoportero' as const],
  ])(
    '%s: sondeo, escucha, apertura ×3, alta y baja de rostro, sin un solo rechazo',
    async (_n, equipo, familia) => {
      const { reloj, traza, peticion, proveedor } = montar();
      const clave = () => desafiosPor.get(equipo.host)?.()?.clave ?? -1;

      // 1 · sondeo («Probar conexión»), con credencial: alcanzado.
      const sondeo = await diagnosticarEquipo({
        host: equipo.host,
        ...CREDENCIAL,
        familia,
        peticion,
        ahora: reloj.ahora,
        olvidarRechazo: true,
      });
      expect(sondeo.contacto.clase).toBe('alcanzado');

      // 2 · la escucha larga se abre y se queda abierta (su nonce es SUYO).
      reloj.avanzar(9_000);
      const escucha = await proveedor.escuchar(equipo.id);
      expect(escucha.detalle).not.toMatch(/credencial/i);
      // La conexión de la escucha termina su intercambio ANTES de mover el reloj:
      // saltar 9 s con su autenticación en vuelo haría caducar el nonce dentro
      // del propio intercambio, cosa que un reloj de verdad no hace en 3 ms.
      await new Promise((listo) => setTimeout(listo, 20));

      // 3 · apertura remota tres veces, con el nonce caducado entre una y otra.
      reloj.avanzar(9_000);
      expect((await proveedor.abrir(equipo.id, 'operador-1')).aceptado).toBe(true);
      reloj.avanzar(35_000);
      expect((await proveedor.abrir(equipo.id, 'operador-1')).aceptado).toBe(true);
      reloj.avanzar(9_000);
      expect((await proveedor.abrir(equipo.id, 'operador-1')).aceptado).toBe(true);

      // 4 · alta de rostro, comprobación en el equipo, y baja.
      reloj.avanzar(35_000);
      const plantillaId = 'c8-' + familia;
      await proveedor.sincronizar(equipo.id, plantillaId, jpegConMedidas());
      expect(plantillasPor.get(equipo.host)?.size).toBe(1);
      reloj.avanzar(9_000);
      await proveedor.suprimir(equipo.id, plantillaId);
      expect(plantillasPor.get(equipo.host)?.size).toBe(0);

      // 5 · el sondeo periódico, otra vez, con todo lo anterior detrás.
      reloj.avanzar(35_000);
      const otraVez = await diagnosticarEquipo({
        host: equipo.host,
        ...CREDENCIAL,
        familia,
        peticion,
        ahora: reloj.ahora,
      });
      expect(otraVez.contacto.clase).toBe('alcanzado');

      escucha.detener();
      expect(clave()).toBe(0);
      sinCredencialEnLaBitacora(traza);
    },
  );

  it('la clave errónea sigue siendo la clave: UN resumen malo y el equipo se declara «credencial»', async () => {
    const reloj = relojManual();
    const peticion = equiposSimulados({
      [TERMINAL.host]: {
        familia: 'terminal',
        ...CREDENCIAL,
        nonce: { vigenciaMs: 5_000, alVencer: 'sin_desafio', ahora: reloj.ahora },
      },
    });
    const sondeo = await diagnosticarEquipo({
      host: TERMINAL.host,
      usuario: CREDENCIAL.usuario,
      clave: 'otra-clave',
      familia: 'terminal',
      peticion,
      ahora: reloj.ahora,
      olvidarRechazo: true,
    });
    expect(sondeo.contacto.clase).toBe('credencial');
    expect(sondeo.contacto.detalle).toMatch(/acaba de rechazar/);
    expect(desafiosPor.get(TERMINAL.host)?.()?.clave).toBe(1);
  });
});
