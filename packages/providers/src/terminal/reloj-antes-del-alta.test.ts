import { describe, expect, it, vi } from 'vitest';
import { Vigencia } from '@ncr/domain-core';
import { TerminalFacial } from './terminal-facial';
import { RelojDelEquipoDesviado } from '../nucleo/errores';
import { desvioDelReloj, desvioEnPalabras } from '../nucleo/reloj-del-equipo';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';

/**
 * R2 (15-N) · el videoportero del 29/09 iba 46 727 s atrasado: reconocía la
 * cara y negaba con «permiso vencido». Antes de dar de alta a alguien con
 * vigencia se lee su reloj; si se desvía más de lo tolerado, no se escribe
 * NADA en el equipo —ni la persona— y se dice cuánto.
 */
const OK_XML =
  '<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString><subStatusCode>ok</subStatusCode></ResponseStatus>';
const AHORA = new Date('2026-09-29T15:00:00-05:00');
const hora = (iso: string): string =>
  `<Time><timeMode>manual</timeMode><localTime>${iso}</localTime><timeZone>CST+5:00:00</timeZone></Time>`;

const vigencia = (): Vigencia => {
  const r = Vigencia.crear(
    new Date('2026-09-29T14:00:00-05:00'),
    new Date('2026-09-29T20:00:00-05:00'),
  );
  if (!r.ok) throw new Error('vigencia');
  return r.valor;
};

const montar = (horaDelEquipo: string | null, maximo: number | null = 30) => {
  const urls: string[] = [];
  const peticion = vi.fn(async (url: string) => {
    urls.push(url);
    const cuerpo = url.includes('System/time')
      ? horaDelEquipo === null
        ? '<ResponseStatus><statusCode>4</statusCode><subStatusCode>notSupport</subStatusCode></ResponseStatus>'
        : hora(horaDelEquipo)
      : url.includes('FDSearch')
        ? '{"numOfMatches":1,"totalMatches":1}'
        : OK_XML;
    return {
      status: 200,
      ok: true,
      headers: new Headers(),
      text: async () => cuerpo,
    } as unknown as Response;
  });
  const terminal = new TerminalFacial({
    host: 'terminal.invalid',
    usuario: 'servicio',
    clave: 'secreta',
    modo: 'decide_el_equipo',
    numeroDePuerta: 1,
    peticion: peticion as unknown as typeof fetch,
    generarCnonce: () => 'c',
    ...(maximo === null ? {} : { desvioDeRelojMaximoS: maximo }),
    horaDelServidor: () => AHORA,
  });
  return { terminal, urls };
};

describe('R2 · el reloj del equipo antes de dar de alta con vigencia', () => {
  it('13 h atrasado: no se escribe nada, y se dice en horas', async () => {
    const { terminal, urls } = montar('2026-09-29T02:01:13-05:00');
    const alta = terminal.sincronizar('portero-1', 'plantilla-7', jpegConMedidas(), vigencia());
    await expect(alta).rejects.toBeInstanceOf(RelojDelEquipoDesviado);
    await expect(alta).rejects.toThrow(/el reloj del equipo va 12 h 58 min atrasado/);
    expect(urls.some((u) => u.includes('UserInfo'))).toBe(false);
    expect(urls.some((u) => /FDLib\?|FaceDataRecord|SetUp/i.test(u))).toBe(false);
  });

  it('en hora (10 s): el alta sigue su camino', async () => {
    const { terminal, urls } = montar('2026-09-29T15:00:10-05:00');
    await terminal.sincronizar('portero-1', 'plantilla-7', jpegConMedidas(), vigencia());
    expect(urls.some((u) => u.includes('UserInfo'))).toBe(true);
  });

  it('sin vigencia no se pregunta la hora: no hay ventana que el reloj pueda correr', async () => {
    const { terminal, urls } = montar('2026-09-29T02:01:13-05:00');
    await terminal.sincronizar('portero-1', 'plantilla-7', jpegConMedidas());
    expect(urls.some((u) => u.includes('System/time'))).toBe(false);
  });

  it('un equipo que no dice su hora no bloquea el alta ([SUPUESTO] S-164)', async () => {
    const { terminal, urls } = montar(null);
    await terminal.sincronizar('portero-1', 'plantilla-7', jpegConMedidas(), vigencia());
    expect(urls.some((u) => u.includes('UserInfo'))).toBe(true);
  });

  it('sin umbral configurado (dobles antiguos) no se comprueba', async () => {
    const { terminal, urls } = montar('2026-09-29T02:01:13-05:00', null);
    await terminal.sincronizar('portero-1', 'plantilla-7', jpegConMedidas(), vigencia());
    expect(urls.some((u) => u.includes('System/time'))).toBe(false);
  });
});

describe('R2 · el desvío, leído y en palabras', () => {
  it('lee el desvío sólo de una hora CON desplazamiento', () => {
    expect(desvioDelReloj(hora('2026-09-29T15:00:30-05:00'), AHORA)).toBe(30);
    expect(desvioDelReloj(hora('2026-09-29T15:00:30'), AHORA)).toBeNull();
    expect(desvioDelReloj('<Time/>', AHORA)).toBeNull();
  });

  it('en horas cuando son horas', () => {
    expect(desvioEnPalabras(-46_727)).toBe('12 h 58 min atrasado');
    expect(desvioEnPalabras(250)).toBe('4 min 10 s adelantado');
    expect(desvioEnPalabras(-45)).toBe('45 s atrasado');
  });
});
