import { describe, expect, it } from 'vitest';
import {
  CAPACIDADES_COMPLETAS,
  CAPACIDADES_SIN_CONSULTAR,
  capacidadesDeclaradas,
  capacidadesDescubiertas,
  capacidadesDesdeJson,
  estadoDe,
  soporta,
} from './capacidades';
import { BibliotecaLlena, CapacidadNoSoportada, EquipoOcupado } from './errores';

describe('capacidades neutrales · tres estados, y `desconocida` no es `si`', () => {
  it('lo que nadie consultó es DESCONOCIDO en todas las capacidades', () => {
    for (const nombre of [
      'aperturaRemota',
      'verificacionRemota',
      'bibliotecaDeRostros',
      'gestionDePersonas',
      'audioBidireccional',
      'senalizacionDeLlamada',
      'suscripcionDeEventos',
      'reconocimientoDePlacas',
      'estadoDeBarrera',
    ] as const) {
      expect(estadoDe(CAPACIDADES_SIN_CONSULTAR, nombre)).toBe('desconocida');
      expect(soporta(CAPACIDADES_SIN_CONSULTAR, nombre)).toBe(false);
    }
  });

  it('declarar un subconjunto deja el resto DESCONOCIDO, nunca en `si`', () => {
    const c = capacidadesDeclaradas({ aperturaRemota: 'si' });
    expect(c.origen).toBe('declaradas');
    expect(soporta(c, 'aperturaRemota')).toBe(true);
    expect(soporta(c, 'verificacionRemota')).toBe(false);
    expect(estadoDe(c, 'verificacionRemota')).toBe('desconocida');
  });

  it('las descubiertas llevan su origen, que es lo que las hace creíbles', () => {
    expect(capacidadesDescubiertas({ reconocimientoDePlacas: 'si' }).origen).toBe('descubiertas');
  });

  it('las completas del simulado dicen `si` a todo, con canal y códec', () => {
    expect(soporta(CAPACIDADES_COMPLETAS, 'audioBidireccional')).toBe(true);
    expect(CAPACIDADES_COMPLETAS.audioBidireccional.canal).toBe(1);
  });

  it('un JSON persistido se lee sin confiar en su forma: lo corrupto vuelve a DESCONOCIDA', () => {
    const c = capacidadesDesdeJson({
      origen: 'descubiertas',
      aperturaRemota: 'si',
      verificacionRemota: 'quizás',
      bibliotecaDeRostros: { estado: 'si', maximo: '100', almacenadas: 3 },
      audioBidireccional: { estado: 'no', canal: 2, formato: '' },
    });
    expect(c.origen).toBe('descubiertas');
    expect(c.aperturaRemota).toBe('si');
    expect(c.verificacionRemota).toBe('desconocida');
    expect(c.bibliotecaDeRostros).toEqual({ estado: 'si', maximo: null, almacenadas: 3 });
    expect(c.audioBidireccional).toEqual({ estado: 'no', canal: 2, formato: null });
    expect(c.senalizacionDeLlamada).toBe('desconocida');
  });

  it('un JSON que no es un objeto —null, texto, número— es «sin consultar»', () => {
    expect(capacidadesDesdeJson(null)).toEqual(CAPACIDADES_SIN_CONSULTAR);
    expect(capacidadesDesdeJson('si')).toEqual(CAPACIDADES_SIN_CONSULTAR);
    expect(capacidadesDesdeJson({ origen: 'inventado' }).origen).toBe('sin_consultar');
  });
});

describe('errores neutrales · la clase decide la reacción, no la marca', () => {
  it('una capacidad negada por DESCONOCIDA lo dice en el mensaje', () => {
    const e = new CapacidadNoSoportada('disp-1', 'audioBidireccional', true);
    expect(e.name).toBe('CapacidadNoSoportada');
    expect(e.message).toMatch(/no ha declarado/);
    expect(e.porDesconocida).toBe(true);
  });

  it('y una negada por NO, también, con otro texto', () => {
    expect(new CapacidadNoSoportada('disp-1', 'aperturaRemota', false).message).toMatch(
      /no soporta «aperturaRemota»/,
    );
  });

  it('ocupado es reintentable; biblioteca llena nombra el máximo cuando lo sabe', () => {
    expect(new EquipoOcupado('disp-1', 'detalle').reintentable).toBe(true);
    expect(new BibliotecaLlena('disp-1', 500).message).toMatch(/500/);
    expect(new BibliotecaLlena('disp-1', null).message).toMatch(/llena$/);
  });
});
