import { describe, expect, it } from 'vitest';
import { analizarEventoAnpr, laCamaraDecidePorSuCuenta } from './evento-anpr';
import { analizarPaqueteAnpr, delimitadorDe, partirPaquete } from './paquete-anpr';
import {
  DELIMITADOR_DEL_EQUIPO,
  conDesfase,
  construirEventoAnprXml,
  construirPaqueteAnpr,
} from './emisor-anpr';

/**
 * El contrato del evento de placa, contra la forma del equipo real.
 *
 * Los valores vienen de la validación en sitio del 2026-09-14 (cámara de
 * entrada, firmware `V5.4.0 build 250425`): dos lecturas, `HNW094` y `EMM195`,
 * las dos con confianza 100 y `barrierGateCtrlType` 0.
 */
const AHORA = new Date('2026-09-14T15:23:45.000Z');

const lectura = (placa: string, extras = {}): ReturnType<typeof construirPaqueteAnpr> =>
  construirPaqueteAnpr({
    placa,
    confianzaCentesimas: 100,
    ocurridoEn: AHORA,
    referenciaExterna: `evt-${placa}`,
    ...extras,
  });

describe('analizarEventoAnpr', () => {
  it('lee los campos que el equipo manda de verdad', () => {
    const xml = construirEventoAnprXml({
      placa: 'HNW094',
      confianzaCentesimas: 100,
      ocurridoEn: AHORA,
      referenciaExterna: 'evt-1',
    });
    const r = analizarEventoAnpr(xml);
    expect(r.ok, r.ok ? '' : r.error.detalle).toBe(true);
    if (!r.ok) return;

    expect(r.valor.placa).toBe('HNW094');
    expect(r.valor.confianzaCentesimas).toBe(100);
    expect(r.valor.referenciaExterna).toBe('evt-1');
    expect(r.valor.canal).toBe(1);
    // Una confianza por carácter: seis letras y dígitos, seis valores.
    expect(r.valor.confianzaPorCaracter).toHaveLength(6);
    expect(r.valor.codigoDeSeguridadDeCaptura).toBe('0000000000000000');
  });

  it('interpreta la hora CON su desfase, que es la del equipo y no la del servidor', () => {
    const xml = construirEventoAnprXml(
      { placa: 'EMM195', confianzaCentesimas: 100, ocurridoEn: AHORA, referenciaExterna: 'e' },
      -300,
    );
    const r = analizarEventoAnpr(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // El texto lleva el desfase; el instante resuelto vuelve a ser el mismo.
    expect(r.valor.ocurridoEnTextual).toMatch(/-05:00$/);
    expect(r.valor.ocurridoEn.toISOString()).toBe(AHORA.toISOString());
  });

  it('acepta la errata del fabricante en el recuadro del vehículo', () => {
    // `vehicelRect`. Si el analizador solo entendiera la forma correcta, el
    // recuadro llegaría nulo contra el equipo real y nadie lo notaría hasta la
    // primera evidencia sin encuadre.
    const r = analizarEventoAnpr(
      construirEventoAnprXml({
        placa: 'HNW094',
        confianzaCentesimas: 100,
        ocurridoEn: AHORA,
        referenciaExterna: 'e',
      }),
    );
    expect(r.ok && r.valor.recuadroDeVehiculo).toEqual({
      x: 420,
      y: 180,
      ancho: 620,
      alto: 480,
    });
    expect(r.ok && r.valor.recuadroDePlaca?.ancho).toBe(180);
  });

  it('el espacio de nombres del equipo NO es el del fabricante, y da igual', () => {
    // El equipo real declara `www.isapi.org`. Un analizador atado al dominio
    // del fabricante habría devuelto vacío contra el aparato de verdad.
    const xml = construirEventoAnprXml({
      placa: 'HNW094',
      confianzaCentesimas: 100,
      ocurridoEn: AHORA,
      referenciaExterna: 'e',
    });
    expect(xml).toContain('www.isapi.org');
    expect(analizarEventoAnpr(xml.replace('www.isapi.org', 'otro.dominio.invalid')).ok).toBe(true);
  });

  it('rechaza, con motivo, lo que no puede convertir en un hecho', () => {
    const base = {
      placa: 'HNW094',
      confianzaCentesimas: 100,
      ocurridoEn: AHORA,
      referenciaExterna: 'e',
    };
    const xml = construirEventoAnprXml(base);

    expect(analizarEventoAnpr('cualquier cosa').ok).toBe(false);
    // Otro tipo de evento no es un error del sistema: es «esto no me toca».
    const otro = analizarEventoAnpr(xml.replace('<eventType>ANPR<', '<eventType>VMD<'));
    expect(otro.ok).toBe(false);
    expect(!otro.ok && otro.error.detalle).toMatch(/no es una lectura de placa/);

    // Sin identificador de evento no hay clave de idempotencia: se rechaza en
    // vez de inventar una, porque inventarla duplicaría el paso del vehículo.
    const sinUuid = analizarEventoAnpr(xml.replace(/<UUID>[^<]*<\/UUID>/, '<UUID></UUID>'));
    expect(sinUuid.ok).toBe(false);
    expect(!sinUuid.ok && sinUuid.error.detalle).toMatch(/identificador propio/);

    const sinPlaca = analizarEventoAnpr(
      xml.replace(/<licensePlate>[^<]*<\/licensePlate>/, '<licensePlate></licensePlate>'),
    );
    expect(sinPlaca.ok).toBe(false);
  });

  it('la confianza fuera de 0..100 se rechaza en vez de recortarse', () => {
    const xml = construirEventoAnprXml({
      placa: 'HNW094',
      confianzaCentesimas: 100,
      ocurridoEn: AHORA,
      referenciaExterna: 'e',
    });
    expect(
      analizarEventoAnpr(xml.replace('>100</confidenceLevel', '>140</confidenceLevel')).ok,
    ).toBe(false);
  });
});

describe('laCamaraDecidePorSuCuenta · el control derivado del dato real', () => {
  it('con barrierGateCtrlType 0 el equipo delega, que es lo medido', () => {
    const r = analizarEventoAnpr(
      construirEventoAnprXml({
        placa: 'HNW094',
        confianzaCentesimas: 100,
        ocurridoEn: AHORA,
        referenciaExterna: 'e',
      }),
    );
    expect(r.ok && laCamaraDecidePorSuCuenta(r.valor)).toBe(false);
  });

  it('con cualquier otro valor lo DICE: es un hallazgo de bloqueo', () => {
    const r = analizarEventoAnpr(
      construirEventoAnprXml({
        placa: 'HNW094',
        confianzaCentesimas: 100,
        ocurridoEn: AHORA,
        referenciaExterna: 'e',
        tipoDeControlDeTalanquera: 1,
      }),
    );
    expect(r.ok && laCamaraDecidePorSuCuenta(r.valor)).toBe(true);
  });

  it('si el campo falta, se trata como «decide» y no como «delega»', () => {
    // Conservador a propósito: la ausencia obliga a mirarlo, no a dar por bueno
    // que el equipo se porta bien.
    const xml = construirEventoAnprXml({
      placa: 'HNW094',
      confianzaCentesimas: 100,
      ocurridoEn: AHORA,
      referenciaExterna: 'e',
    }).replace(/<barrierGateCtrlType>[^<]*<\/barrierGateCtrlType>/, '');
    const r = analizarEventoAnpr(xml);
    expect(r.ok && laCamaraDecidePorSuCuenta(r.valor)).toBe(true);
  });
});

describe('el envío multipart del equipo', () => {
  it('el delimitador EMPIEZA POR GUIONES, y aun así se parte bien', () => {
    // El fabricante usa la forma clásica. Un analizador que no anteponga los
    // dos guiones encuentra coincidencias dentro del JPEG y corrompe la parte
    // binaria sin dar ningún error.
    expect(DELIMITADOR_DEL_EQUIPO.startsWith('-')).toBe(true);
    const { cuerpo, tipoDeContenido } = lectura('HNW094');
    expect(delimitadorDe(tipoDeContenido)).toBe(DELIMITADOR_DEL_EQUIPO);

    const partes = partirPaquete(cuerpo, tipoDeContenido);
    expect(partes.ok).toBe(true);
    if (!partes.ok) return;
    expect(partes.valor.map((p) => p.nombre)).toEqual([
      'anpr.xml',
      'detectionPicture.jpg',
      'licensePlatePicture.jpg',
    ]);
  });

  it('las imágenes salen con sus bytes intactos, no pasadas por texto', () => {
    const { cuerpo, tipoDeContenido } = lectura('EMM195');
    const r = analizarPaqueteAnpr(cuerpo, tipoDeContenido);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.imagenes).toHaveLength(2);
    for (const imagen of r.valor.imagenes) {
      // Firma JPEG: un cuerpo decodificado como UTF-8 la habría destruido, y el
      // fallo aparecería después, al validar el tipo real de la evidencia.
      expect([imagen.contenido[0], imagen.contenido[1]]).toEqual([0xff, 0xd8]);
      expect([
        imagen.contenido[imagen.contenido.length - 2],
        imagen.contenido[imagen.contenido.length - 1],
      ]).toEqual([0xff, 0xd9]);
    }
  });

  it('el evento y las imágenes salen del mismo envío', () => {
    const { cuerpo, tipoDeContenido } = lectura('HNW094');
    const r = analizarPaqueteAnpr(cuerpo, tipoDeContenido);
    expect(r.ok && r.valor.evento.placa).toBe('HNW094');
  });

  it('un envío sin delimitador declarado se rechaza con motivo', () => {
    const { cuerpo } = lectura('HNW094');
    const r = partirPaquete(cuerpo, 'multipart/form-data');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.detalle).toMatch(/delimitador/);
  });
});

describe('conDesfase', () => {
  it('escribe la hora local con el desfase pegado, como el equipo', () => {
    expect(conDesfase(new Date('2026-09-14T15:23:45.000Z'), -300)).toBe(
      '2026-09-14T10:23:45-05:00',
    );
    expect(conDesfase(new Date('2026-09-14T15:23:45.000Z'), 0)).toBe('2026-09-14T15:23:45+00:00');
  });
});
