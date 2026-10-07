import { afterEach, describe, expect, it } from 'vitest';
import { juzgarHora } from './diagnostico-de-equipo';
import { desvioDelReloj } from '../nucleo/reloj-del-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D0 · LA FICHA Y LA COMPUERTA DE ALTAS JUZGAN EL RELOJ IGUAL
 *
 * El 06/10 la ficha avisaba de relojes desfasados y, aun así, la terminal
 * recibía personas con vigencia. La compuerta de altas (`exigirRelojEnHora`)
 * sólo juzga una hora CON desplazamiento ([SUPUESTO] S-164): sin él no frena.
 * La ficha, en cambio, leía la hora sin zona en la del PROCESO: en un servidor
 * en UTC inventaba cinco horas de desvío, en uno en Bogotá acertaba, y en los
 * dos decía «no se le da de alta a nadie con vigencia» cuando la compuerta sí
 * daba de alta. Ahora las dos usan `desvioDelReloj`: lo que una no puede
 * juzgar, la otra lo dice «no comprobado», con el motivo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const AHORA = new Date('2026-10-06T14:00:00Z'); // 09:00 en Bogotá
const hora = (leida: string): string => `<Time><localTime>${leida}</localTime></Time>`;
const ZONA_DEL_PROCESO = process.env['TZ'];

afterEach(() => {
  if (ZONA_DEL_PROCESO === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ZONA_DEL_PROCESO;
});

describe('15-X · D0 · una hora sin zona no se juzga en la zona del proceso', () => {
  it.each(['UTC', 'America/Bogota'])(
    'con el proceso en %s: «no comprobado», con el motivo',
    (zona) => {
      process.env['TZ'] = zona;
      const h = juzgarHora(hora('2026-10-06T09:00:00'), AHORA);
      expect(h.desvioSegundos).toBeNull();
      expect(h.excesiva).toBe(false);
      expect(h.leida).toBe('2026-10-06T09:00:00');
      expect(h.detalle).toMatch(/sin zona/);
      expect(h.detalle).toMatch(/no frena las altas/);
      expect(h.detalle).not.toMatch(/no se le da de alta/);
    },
  );

  it('una hora ilegible sigue diciéndose ilegible', () => {
    const h = juzgarHora(hora('ayer'), AHORA);
    expect(h.desvioSegundos).toBeNull();
    expect(h.detalle).toMatch(/formato utilizable/);
  });
});

describe('15-X · D0 · la ficha nunca contradice a la compuerta', () => {
  const CUERPOS = [
    hora('2026-10-06T09:00:00-05:00'),
    hora('2026-10-06T09:00:31-05:00'),
    hora('2026-10-06T14:00:30Z'),
    hora('2026-10-06T09:00:00'),
    hora('2026-10-06T21:00:00+0700'),
    hora('ayer'),
    '<Time><time>2026-10-06T08:59:29-05:00</time></Time>',
    '<Time/>',
  ];

  it.each(CUERPOS)('mismo desvío en las dos: %s', (cuerpo) => {
    process.env['TZ'] = 'UTC';
    expect(juzgarHora(cuerpo, AHORA).desvioSegundos).toBe(desvioDelReloj(cuerpo, AHORA));
  });

  it('en el límite: 30 s dentro de tolerancia, 31 s fuera, como la compuerta', () => {
    expect(juzgarHora(hora('2026-10-06T09:00:30-05:00'), AHORA, 30).excesiva).toBe(false);
    expect(juzgarHora(hora('2026-10-06T09:00:31-05:00'), AHORA, 30).excesiva).toBe(true);
    expect(juzgarHora(hora('2026-10-06T08:59:29-05:00'), AHORA, 30).excesiva).toBe(true);
  });
});
