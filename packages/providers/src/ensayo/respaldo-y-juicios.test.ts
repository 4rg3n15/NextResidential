import { describe, expect, it } from 'vitest';
import { canonico, capturarRespaldo, restaurarRespaldo } from './respaldo-de-configuracion';
import {
  desfaseDeZonaIana,
  desfaseDeZonaPosix,
  juzgarZona,
  rotuloDeDesfase,
} from './zona-del-equipo';
import { juzgarPersonasYRostros } from './capacidades-de-personas';
import { sinSecretosConocidos } from './informe-de-ensayo';
import type { EquipoDeEnsayo } from './tipos';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J2 (15-L) · RESPALDO Y REVERSIÓN, CONTRA EL SIMULADO QUE LEE LO QUE SE ESCRIBE
 *
 * El simulado guarda de verdad lo que se le escribe —el `AcsCfg`, el modo de
 * la barrera, los canales de audio— y un documento sin espacio de nombres le
 * contesta «OK» sin cambiar nada, como en sitio. Por eso «restaurado» exige
 * la relectura: una reversión que se fiara del «OK» pasaría esta prueba sin
 * haber revertido nada.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const AHORA = new Date('2026-09-27T14:00:00Z');

const equipo = (
  familia: EquipoDeEnsayo['familia'],
  guion: Partial<GuionDeEquipo> = {},
  peticion?: typeof fetch,
): EquipoDeEnsayo => ({
  familia,
  host: `${familia}.respaldo.invalid`,
  usuario: 'servicio',
  clave: 'p1',
  puerta: 1,
  canalDeVideo: '102',
  puertoRtsp: 554,
  peticion: peticion ?? equipoSimulado({ familia, usuario: 'servicio', clave: 'p1', ...guion }),
});

const escribir = async (
  e: EquipoDeEnsayo,
  proposito: string,
  contenido: string,
  canal?: number,
) => {
  const r = rutaPara(proposito, e.familia, canal);
  const tipo = contenido.startsWith('{') ? 'application/json' : 'application/xml';
  return new ClienteDeEquipo(e).pedir(r.metodo, r.ruta, { tipo, contenido });
};

describe('respaldo y reversión de la configuración (J2)', () => {
  it('terminal: se cambia la verificación remota, se revierte y se relee igual', async () => {
    const e = equipo('terminal');
    const respaldo = await capturarRespaldo(e, AHORA);
    expect(respaldo.serie).toBe('SIM0000001');
    expect(respaldo.documentos.map((d) => [d.clave, d.restaurable])).toEqual([
      ['verificacion-remota', true],
    ]);
    await escribir(
      e,
      'fijar que la terminal espere el veredicto de la plataforma',
      JSON.stringify({ AcsCfg: { remoteCheckDoorEnabled: false, remoteCheckTimeout: 9 } }),
    );
    expect(await restaurarRespaldo(e, respaldo)).toEqual([
      {
        clave: 'verificacion-remota',
        estado: 'restaurado',
        detalle: 'escrito y releído igual al respaldo',
      },
    ]);
    // Otra vez: nada que escribir.
    expect((await restaurarRespaldo(e, respaldo))[0]?.estado).toBe('igual');
  });

  it('cámara: el modo de control vuelve a como estaba; lo que no cambió no se toca', async () => {
    const e = equipo('camara', { ctrlMod: '0' });
    const respaldo = await capturarRespaldo(e, AHORA);
    expect(respaldo.documentos.map((d) => d.clave)).toEqual([
      'quien-controla-la-barrera',
      'receptor-de-eventos',
      'disparador-de-deteccion',
      'pais-del-algoritmo',
    ]);
    // La entrega corrige la cámara (ctrlMode 1) y después se revierte a 0.
    await escribir(
      e,
      'corregir quién controla la barrera',
      '<EntranceParam version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><ctrlMode>1</ctrlMode></EntranceParam>',
    );
    const r = await restaurarRespaldo(e, respaldo);
    expect(r.find((x) => x.clave === 'quien-controla-la-barrera')?.estado).toBe('restaurado');
    expect(r.filter((x) => x.clave !== 'quien-controla-la-barrera').map((x) => x.estado)).toEqual([
      'igual',
      'igual',
      'igual',
    ]);
  });

  it('videoportero: el canal de audio se escribe CON su espacio de nombres y se relee', async () => {
    const e = equipo('videoportero', { canalesDeAudio: [{ id: 1, habilitado: false }] });
    const respaldo = await capturarRespaldo(e, AHORA);
    await escribir(
      e,
      'configurar un canal de audio bidireccional',
      '<TwoWayAudioChannel version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><id>1</id><enabled>true</enabled></TwoWayAudioChannel>',
      1,
    );
    expect((await restaurarRespaldo(e, respaldo))[0]?.estado).toBe('restaurado');
  });

  it('un «OK» que no cambió nada NO es una reversión: la relectura lo delata', async () => {
    const base = equipoSimulado({
      familia: 'videoportero',
      usuario: 'servicio',
      clave: 'p1',
      canalesDeAudio: [{ id: 1, habilitado: false }],
    });
    // Un intermediario que, al revertir, quita el espacio de nombres: el equipo
    // dice OK y no escribe. Es la MISMA función de principio a fin: una
    // distinta abriría otra sesión Digest sobre el mismo nonce (ver la guía de
    // entrega, «venció el desafío»).
    let quitar = false;
    const sinEspacio: typeof fetch = async (u, o) =>
      base(
        u,
        quitar && typeof o?.body === 'string'
          ? { ...o, body: o.body.replace(/ xmlns="[^"]+"/, '') }
          : o,
      );
    const e = equipo('videoportero', {}, sinEspacio);
    const respaldo = await capturarRespaldo(e, AHORA);
    await escribir(
      e,
      'configurar un canal de audio bidireccional',
      '<TwoWayAudioChannel version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><id>1</id><enabled>true</enabled></TwoWayAudioChannel>',
      1,
    );
    quitar = true;
    const r = await restaurarRespaldo(e, respaldo);
    expect(r[0]?.estado).toBe('fallo');
    expect(r[0]?.detalle).toMatch(/lectura posterior NO coincide/);
  });

  it('el respaldo de OTRO equipo no se aplica', async () => {
    const respaldo = await capturarRespaldo(equipo('terminal', { serie: 'AAA111' }), AHORA);
    const r = await restaurarRespaldo(equipo('terminal', { serie: 'BBB222' }), respaldo);
    expect(r).toHaveLength(1);
    expect(r[0]?.detalle).toMatch(/OTRO equipo/);
  });

  it('una contraseña en el documento no se guarda, y el recurso se restaura a mano', async () => {
    const base = equipoSimulado({ familia: 'camara', usuario: 'servicio', clave: 'p1' });
    const conClave: typeof fetch = async (u, o) => {
      const r = await base(u, o);
      if (!/httpHosts$/.test(new URL(String(u)).pathname) || r.status !== 200) return r;
      const texto = (await r.text()).replace(
        '</httpAuthenticationMethod>',
        '</httpAuthenticationMethod><userName>x</userName><password>otra-clave-9</password>',
      );
      return new Response(texto, { status: 200 });
    };
    const respaldo = await capturarRespaldo(equipo('camara', {}, conClave), AHORA);
    const receptor = respaldo.documentos.find((d) => d.clave === 'receptor-de-eventos');
    expect(receptor?.restaurable).toBe(false);
    expect(receptor?.contenido).toContain('<password></password>');
    expect(JSON.stringify(respaldo)).not.toContain('otra-clave-9');
    const r = await restaurarRespaldo(equipo('camara', {}, conClave), respaldo);
    expect(r.find((x) => x.clave === 'receptor-de-eventos')?.estado).toBe('no_restaurable');
  });

  it('lo que el equipo no sabe leer se anota y no se restaura', async () => {
    const e = equipo('terminal', {
      sinSoporte: ['leer si la terminal espera el veredicto de la plataforma'],
    });
    const respaldo = await capturarRespaldo(e, AHORA);
    expect(respaldo.documentos[0]).toMatchObject({ restaurable: false, contenido: null });
    expect((await restaurarRespaldo(e, respaldo))[0]?.estado).toBe('no_restaurable');
  });

  it('canónico: sin prólogo, sin espacios entre etiquetas, JSON con claves ordenadas', () => {
    expect(canonico('<?xml version="1.0"?>\n<a>\n  <b>1</b>\n</a>')).toBe('<a><b>1</b></a>');
    expect(canonico('{"b":1,"a":{"d":2,"c":[3]}}')).toBe('{"a":{"c":[3],"d":2},"b":1}');
    expect(canonico('{roto')).toBe('{roto');
  });
});

describe('la zona del equipo (paso 2)', () => {
  it('POSIX con el signo al revés: CST+5 es UTC−05:00', () => {
    expect(desfaseDeZonaPosix('CST+5:00:00')).toBe(-300);
    expect(desfaseDeZonaPosix('CST-8:00:00')).toBe(480);
    expect(desfaseDeZonaPosix('IST-5:30:00')).toBe(330);
    expect(desfaseDeZonaPosix('basura')).toBeNull();
    expect(desfaseDeZonaPosix('CST+20:00:00')).toBeNull();
    expect(desfaseDeZonaIana('America/Bogota', AHORA)).toBe(-300);
    expect(desfaseDeZonaIana('UTC', AHORA)).toBe(0);
    expect(desfaseDeZonaIana('No/Existe', AHORA)).toBeNull();
    expect(rotuloDeDesfase(-300)).toBe('UTC−05:00');
    expect(rotuloDeDesfase(330)).toBe('UTC+05:30');
  });

  it('manda la fuente más desfavorable, y sin zona legible no se afirma nada', () => {
    const doc = (zona: string, local: string) =>
      `<Time><localTime>${local}</localTime><timeZone>${zona}</timeZone></Time>`;
    expect(
      juzgarZona(doc('CST+5:00:00', '2026-09-27T09:00:00-05:00'), 'America/Bogota', AHORA).correcta,
    ).toBe(true);
    const mal = juzgarZona(
      doc('CST+5:00:00', '2026-09-27T14:00:00+00:00'),
      'America/Bogota',
      AHORA,
    );
    expect(mal.correcta).toBe(false);
    expect(mal.detalle).toMatch(/UTC\+00:00.*UTC−05:00.*5 h/);
    expect(juzgarZona('<Time/>', 'America/Bogota', AHORA).correcta).toBeNull();
    expect(juzgarZona(doc('CST+5', 'x'), 'No/Existe', AHORA).correcta).toBeNull();
  });
});

describe('personas y rostros declarados frente a lo que se va a mandar (paso 3, decisión 8)', () => {
  const L = LIMITES_DE_FOTO_POR_OMISION;
  it('un equipo conforme: sin fallos, con sus límites anotados', () => {
    const j = juzgarPersonasYRostros(
      JSON.stringify({
        FDLibCap: {
          supportFDFunction: 'post,delete,put,get,setUp',
          FDRecordDataMaxNum: 3000,
          facePicFormat: { '@opt': ['jpg', 'png'] },
        },
      }),
      JSON.stringify({
        UserInfo: { supportFunction: { '@opt': 'post,delete,put,get' }, maxRecordNum: 1500 },
      }),
      L,
    );
    expect(j.fallos).toEqual([]);
    expect(j.notas.join(' | ')).toMatch(
      /hasta 3000 rostros · formatos jpg, png.*personas: hasta 1500/,
    );
  });

  it('sin setUp, sin JPEG, sin alta, sin «visitor»: cada uno es un fallo con su porqué', () => {
    const j = juzgarPersonasYRostros(
      JSON.stringify({ supportFDFunction: 'get,delete', facePicFormat: { '@opt': 'bmp' } }),
      JSON.stringify({ supportFunction: 'get', userType: { '@opt': 'normal,blackList' } }),
      L,
    );
    expect(j.fallos).toHaveLength(4);
    expect(j.fallos.join(' | ')).toMatch(/setUp.*JPEG.*post.*visitor/);
  });

  it('lo que el equipo no contestó es un fallo, no un «conforme»', () => {
    const j = juzgarPersonasYRostros(null, '{roto', L);
    expect(j.fallos).toEqual([
      'no se pudo leer qué admite la biblioteca de rostros',
      'no se pudo leer qué admite la gestión de personas',
    ]);
  });
});

describe('el informe no imprime credenciales', () => {
  it('tacha cada valor conocido, incluso dentro de un mensaje del equipo', () => {
    expect(
      sinSecretosConocidos('usuario servicio, clave s3cr3t', ['s3cr3t', 'servicio', 'x']),
    ).toBe('usuario ••••, clave ••••');
  });
});
