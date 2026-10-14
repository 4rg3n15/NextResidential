import { describe, expect, it } from 'vitest';
import {
  CONSEJOS_DEL_RESIDENTE,
  claveDeAhoraNo,
  explicacionDelRostroDelMenor,
  rostroDelMenorEnLaWeb,
  textoDelEquipo,
  textoDelEstado,
  textosDelRostro,
  tieneRostro,
} from './rostro';

const base = {
  calidad: 0.8,
  registradoEn: '2026-10-01T12:00:00.000Z',
  venceEn: '2027-10-01T12:00:00.000Z',
  diasParaVencer: 352,
  equiposConRostro: 2,
  equiposConMiRostro: 2,
  equipos: [],
};

describe('el estado del rostro, con las palabras de la app', () => {
  it('cada estado tiene su frase, y la de «pendiente» depende de si hay equipos', () => {
    expect(textoDelEstado({ ...base, estado: 'sin_rostro' })).toBe(
      'No ha registrado su rostro. Es opcional: puede entrar sin él.',
    );
    expect(textoDelEstado({ ...base, estado: 'en_retiro' })).toMatch(/se está retirando/);
    expect(textoDelEstado({ ...base, estado: 'pendiente', equiposConRostro: 0 })).toMatch(
      /todavía no tiene equipos/,
    );
    expect(textoDelEstado({ ...base, estado: 'pendiente' })).toMatch(/Se está enviando/);
    expect(textoDelEstado({ ...base, estado: 'parcial', equiposConMiRostro: 1 })).toBe(
      'Registrado en 1 de 2 equipos. Los demás lo recibirán en cuanto respondan.',
    );
    expect(textoDelEstado({ ...base, estado: 'activa', equiposConRostro: 1 })).toBe(
      'Activo: el equipo de la portería lo reconoce.',
    );
    expect(textoDelEstado({ ...base, estado: 'activa' })).toBe(
      'Activo: los 2 equipos de la portería lo reconocen.',
    );
    expect(textoDelEstado({ ...base, estado: 'por_vencer', diasParaVencer: 0 })).toMatch(
      /vence hoy/,
    );
    expect(textoDelEstado({ ...base, estado: 'por_vencer', diasParaVencer: 1 })).toMatch(
      /vence mañana/,
    );
    expect(textoDelEstado({ ...base, estado: 'por_vencer', diasParaVencer: 9 })).toMatch(
      /vence en 9 días/,
    );
  });

  it('tiene rostro salvo «sin rostro» y «en retiro»; los equipos se leen', () => {
    expect(tieneRostro('activa')).toBe(true);
    expect(tieneRostro('sin_rostro')).toBe(false);
    expect(tieneRostro('en_retiro')).toBe(false);
    expect(textoDelEquipo('sincronizada')).toBe('Lo reconoce');
    expect(textoDelEquipo('fallida')).toBe('No lo recibió todavía');
  });

  it('los textos del propio y del menor, con las dos declaraciones de ADR-039', () => {
    expect(textosDelRostro(null).registrar).toBe('Registrar mi rostro');
    expect(textosDelRostro(null).declaraciones).toEqual([]);
    const m = textosDelRostro('Sofía Pérez');
    expect(m.titulo).toBe('Rostro de Sofía Pérez');
    expect(m.acepto).toMatch(/como su representante/);
    expect(m.declaraciones).toEqual([
      'Soy su representante legal',
      'Le expliqué para qué es su rostro y está de acuerdo',
    ]);
  });
});

describe('el rostro de un menor, según su edad y quién mira', () => {
  it('de 15 a 17 lo gestiona el titular; otro adulto lee por qué no; menos de 15 no se ofrece', () => {
    expect(rostroDelMenorEnLaWeb({ edad: 16 }, true)).toBe('gestionar');
    expect(rostroDelMenorEnLaWeb({ edad: 16 }, false)).toBe('solo_el_titular');
    expect(rostroDelMenorEnLaWeb({ edad: 14 }, true)).toBe('desde_los_15');
    expect(rostroDelMenorEnLaWeb({ edad: 18 }, true)).toBe('ya_es_mayor');
    expect(rostroDelMenorEnLaWeb({ edad: null }, true)).toBe('sin_fecha');
    expect(explicacionDelRostroDelMenor('solo_el_titular')).toBe(
      'Lo registra el titular del hogar.',
    );
    expect(explicacionDelRostroDelMenor('desde_los_15')).toBe(
      'No se registra el rostro de menores de 15 años.',
    );
    expect(explicacionDelRostroDelMenor('gestionar')).toBeNull();
  });

  it('los consejos de la foto son los de la app, y la clave de «Ahora no» es por cuenta', () => {
    expect(CONSEJOS_DEL_RESIDENTE.BORROSA).toBe(
      'La foto salió movida. Sostenga el teléfono quieto y repita.',
    );
    expect(CONSEJOS_DEL_RESIDENTE.VARIOS_ROSTROS).toBe(
      'Se ve más de una persona. La foto debe ser de una sola.',
    );
    expect(claveDeAhoraNo('u-1')).toBe('ncr.rostro.ahora-no.u-1');
  });
});
