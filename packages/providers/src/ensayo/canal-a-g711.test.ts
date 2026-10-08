import { describe, expect, it, vi } from 'vitest';
import { DESTINO_G711, documentoConG711, pasarCanalAG711 } from './canal-a-g711';

/**
 * B4 (15-S2) · pasar a G.711 sólo con autorización, escribiendo el documento
 * entero y releyendo; sin autorización, el equipo ni se toca.
 */
const lista = (formato: string) =>
  '<?xml version="1.0" encoding="UTF-8"?><TwoWayAudioChannelList version="2.0" ' +
  'xmlns="http://www.isapi.org/ver20/XMLSchema"><TwoWayAudioChannel><id>1</id>' +
  `<enabled>false</enabled><audioCompressionType>${formato}</audioCompressionType>` +
  '<speakerVolume>5</speakerVolume></TwoWayAudioChannel></TwoWayAudioChannelList>';

const clienteFalso = (inicial: string, acepta = true) => {
  let formato = inicial;
  const escrituras: string[] = [];
  const pedir = vi.fn(async (metodo: string, _ruta: string, cuerpo?: { contenido: string }) => {
    if (metodo === 'PUT') {
      escrituras.push(cuerpo?.contenido ?? '');
      if (acepta)
        formato = /<audioCompressionType>([^<]*)</.exec(cuerpo?.contenido ?? '')?.[1] ?? '';
      return { ok: acepta, estado: acepta ? 200 : 400, cuerpo: '' };
    }
    return { ok: true, estado: 200, cuerpo: lista(formato) };
  });
  return { cliente: { pedir } as never, escrituras, pedir };
};

describe('pasarCanalAG711 (B4)', () => {
  it('con autorización: escribe el canal entero con sólo el formato cambiado, y lo relee', async () => {
    const f = clienteFalso('G.722.1');
    const confirmar = vi.fn(async (_pregunta: string) => true);
    const r = await pasarCanalAG711({ ...f, familia: 'terminal', canal: 1, confirmar });
    expect(confirmar.mock.calls[0]?.[0]).toMatch(
      /pasa de G\.722\.1 a G\.711ulaw.*AUTORIZA el cliente/,
    );
    expect(r).toMatchObject({ cambiado: true, fallo: false });
    expect(f.escrituras[0]).toMatch(/xmlns="http:\/\/www\.isapi\.org\/ver20\/XMLSchema"/);
    expect(f.escrituras[0]).toMatch(/<speakerVolume>5<\/speakerVolume>/);
    expect(f.escrituras[0]).toMatch(new RegExp(`<audioCompressionType>${DESTINO_G711}<`));
  });

  it('sin autorización (o sin respuesta): el equipo no se toca', async () => {
    for (const respuesta of [false, null]) {
      const f = clienteFalso('G.722.1');
      const r = await pasarCanalAG711({
        ...f,
        familia: 'terminal',
        canal: 1,
        confirmar: async () => respuesta,
      });
      expect(r.cambiado).toBe(false);
      expect(f.escrituras).toEqual([]);
    }
  });

  it('ya en G.711: nada que hacer ni preguntar', async () => {
    const f = clienteFalso('G.711alaw');
    const confirmar = vi.fn(async () => true);
    const r = await pasarCanalAG711({ ...f, familia: 'videoportero', canal: 1, confirmar });
    expect(r).toMatchObject({ cambiado: false, fallo: false });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('el equipo lo rechaza: FALLO, nunca un «cambiado» falso', async () => {
    const f = clienteFalso('AAC', false);
    const r = await pasarCanalAG711({
      ...f,
      familia: 'terminal',
      canal: 1,
      confirmar: async () => true,
    });
    expect(r).toMatchObject({ cambiado: false, fallo: true });
    expect(r.lineas[0]).toMatch(/HTTP 400 .*releído dice AAC/);
  });

  it('un canal que no existe o sin formato: no se toca', async () => {
    const f = clienteFalso('AAC');
    expect(
      (await pasarCanalAG711({ ...f, familia: 'terminal', canal: 9, confirmar: async () => true }))
        .fallo,
    ).toBe(true);
    expect(documentoConG711('<TwoWayAudioChannel><id>1</id></TwoWayAudioChannel>')).toBeNull();
  });
});
