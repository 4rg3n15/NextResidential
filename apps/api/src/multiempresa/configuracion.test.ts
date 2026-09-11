import { describe, expect, it } from 'vitest';
import {
  CLAVES_EDITABLES,
  cambiosEfectivos,
  puedeEditar,
  resumenDeCambios,
  validarCambios,
} from './configuracion';
import type { ConfiguracionDeCopropiedad } from './configuracion';

const ACTUAL: ConfiguracionDeCopropiedad = {
  nombre: 'Villas del Bosque',
  zonaHoraria: 'America/Bogota',
  umbralConfianzaPlaca: 0.85,
  politicaContingenciaEdge: 'denegar',
  umbralLatidoMinutos: 5,
  nit: '900123456',
  estado: 'activa',
  plazoConsentimientoHoras: 24,
  margenCacheReglasHoras: 24,
  versionReglasActual: 3,
};

describe('quién puede cambiar qué', () => {
  it('el administrador cambia identidad y operación, no los umbrales que deciden aperturas', () => {
    expect(puedeEditar('administrador', 'nombre')).toBe(true);
    expect(puedeEditar('administrador', 'zonaHoraria')).toBe(true);
    expect(puedeEditar('administrador', 'umbralLatidoMinutos')).toBe(true);
    // Por debajo del umbral, una lectura de placa NO decide sola: escala al
    // portero (CU-01, excepción 3a). Bajarlo convierte lecturas dudosas en
    // aperturas automáticas.
    expect(puedeEditar('administrador', 'umbralConfianzaPlaca')).toBe(false);
    expect(puedeEditar('administrador', 'politicaContingenciaEdge')).toBe(false);
  });

  it('el superadministrador sí', () => {
    for (const clave of CLAVES_EDITABLES) {
      expect(puedeEditar('superadministrador', clave)).toBe(true);
    }
  });

  it('ningún rol operativo edita nada', () => {
    for (const rol of ['portero', 'operador_central', 'residente', 'servicio'] as const) {
      for (const clave of CLAVES_EDITABLES) expect(puedeEditar(rol, clave)).toBe(false);
    }
  });
});

describe('validación en el servidor, no solo en el formulario', () => {
  it('un ajuste que la consola no ofrece se rechaza igualmente', () => {
    // La restricción real es esta. Si solo viviera en la consola, bastaría un
    // `curl` para saltársela.
    const r = validarCambios('administrador', { nit: '999' } as never);
    expect(r).toHaveLength(1);
    expect(r[0]?.motivo).toContain('no es un ajuste editable');
  });

  it('el administrador que intenta el umbral de placa recibe el motivo, no un 500', () => {
    const r = validarCambios('administrador', { umbralConfianzaPlaca: 0.5 });
    expect(r).toHaveLength(1);
    expect(r[0]?.clave).toBe('umbralConfianzaPlaca');
  });

  it('devuelve TODOS los rechazos, no el primero', () => {
    const r = validarCambios('superadministrador', {
      nombre: '',
      zonaHoraria: 'Marte/Olympus',
      umbralConfianzaPlaca: 2,
      umbralLatidoMinutos: 0,
    });
    expect(r).toHaveLength(4);
  });

  it('acepta un lote correcto', () => {
    expect(
      validarCambios('superadministrador', {
        nombre: 'Parcelación El Roble',
        zonaHoraria: 'America/Bogota',
        umbralConfianzaPlaca: 0.9,
        politicaContingenciaEdge: 'escalar_portero',
        umbralLatidoMinutos: 10,
      }),
    ).toHaveLength(0);
  });

  it('el umbral fuera de rango se rechaza por los dos lados', () => {
    expect(validarCambios('superadministrador', { umbralConfianzaPlaca: 0.49 })).toHaveLength(1);
    expect(validarCambios('superadministrador', { umbralConfianzaPlaca: 1.01 })).toHaveLength(1);
    expect(validarCambios('superadministrador', { umbralConfianzaPlaca: 1 })).toHaveLength(0);
  });
});

describe('qué llega a la auditoría', () => {
  it('reenviar el formulario sin tocar nada NO es un cambio', () => {
    // Si lo fuera, `auditoria_seguridad` se llenaría de ruido justo en la tabla
    // que se consulta durante un incidente.
    expect(
      cambiosEfectivos(ACTUAL, { nombre: 'Villas del Bosque', umbralLatidoMinutos: 5 }),
    ).toEqual({});
  });

  it('los espacios sobrantes no cuentan como cambio', () => {
    expect(cambiosEfectivos(ACTUAL, { nombre: '  Villas del Bosque  ' })).toEqual({});
  });

  it('un cambio real se recoge ya normalizado', () => {
    expect(cambiosEfectivos(ACTUAL, { nombre: '  Villas del Norte ' })).toEqual({
      nombre: 'Villas del Norte',
    });
  });

  it('el resumen dice de qué valor a cuál', () => {
    const efectivos = cambiosEfectivos(ACTUAL, { umbralLatidoMinutos: 12 });
    expect(resumenDeCambios(ACTUAL, efectivos)).toBe('umbralLatidoMinutos: 5 → 12');
  });
});
