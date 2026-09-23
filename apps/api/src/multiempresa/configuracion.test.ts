import { describe, expect, it } from 'vitest';
import {
  CLAVES_EDITABLES,
  MARGEN_LATIDO_MINUTOS,
  UMBRAL_CONFIANZA_PLACA_ANPR,
  UMBRAL_CONFIANZA_PLACA_FRACCION,
  cambiosEfectivos,
  puedeEditar,
  resumenDeCambios,
  validarCambios,
  validarDireccion,
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

describe('B.5 · dos ajustes que dejaron de serlo', () => {
  it('el umbral de confianza y el margen de latido ya NO son editables por nadie', () => {
    // No es que el administrador no pueda: es que **no hay ajuste**. Un campo
    // de formulario dice «esto es tuyo, elige», y ninguno de los dos lo es.
    expect(CLAVES_EDITABLES).not.toContain('umbralConfianzaPlaca');
    expect(CLAVES_EDITABLES).not.toContain('umbralLatidoMinutos');
  });

  it('ni por la puerta de atrás: llegan como ajuste desconocido', () => {
    const r = validarCambios('superadministrador', { umbralConfianzaPlaca: 0.5 } as never);
    expect(r).toHaveLength(1);
    expect(r[0]?.motivo).toContain('no es un ajuste editable');
  });

  it('el umbral vive en la escala 0–100 del evento ANPR, no en centésimas inventadas', () => {
    // `confidenceLevel` es un entero 0–100 en el evento ANPR: de ahí sale el
    // 80. La fracción se DERIVA, para que no haya dos literales que signifiquen
    // lo mismo y acaben divergiendo.
    expect(UMBRAL_CONFIANZA_PLACA_ANPR).toBe(80);
    expect(UMBRAL_CONFIANZA_PLACA_FRACCION).toBeCloseTo(0.8, 10);
    expect(MARGEN_LATIDO_MINUTOS).toBe(5);
  });
});

describe('B.4 · la dirección se valida, y cada causa dice lo suyo', () => {
  it('menos de ocho caracteres no es una dirección', () => {
    expect(validarDireccion('Cl 4')).toContain('al menos 8');
  });

  it('sin número tampoco: una dirección lleva cifra', () => {
    expect(validarDireccion('Calle del Bosque')).toContain('número');
  });

  it('y sin vía tampoco: «12345678» no es una dirección', () => {
    expect(validarDireccion('12345678')).toContain('vía');
  });

  it('los mensajes son DISTINTOS para causas distintas', () => {
    const corta = validarDireccion('Cl 4');
    const sinNumero = validarDireccion('Calle del Bosque');
    const sinVia = validarDireccion('12345678');
    expect(new Set([corta, sinNumero, sinVia]).size).toBe(3);
  });

  it('una dirección de verdad pasa', () => {
    expect(validarDireccion('Calle 100 # 15-20')).toBeNull();
    expect(validarDireccion('Km 4 Via La Calera')).toBeNull();
  });

  it('el saneamiento de §2.7.4 va ANTES de medir', () => {
    // Ocho caracteres de control no son ocho caracteres. Sin sanear primero,
    // esto habría pasado por dirección.
    expect(validarDireccion('\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007')).toContain('vacía');
    // Y lo que sí es dirección sigue siéndolo aunque llegue con basura alrededor.
    expect(validarDireccion('  Calle 100 # 15-20\u0007 ')).toBeNull();
  });
});

describe('quién puede cambiar qué', () => {
  it('el administrador cambia identidad y operación, no la contingencia del Edge', () => {
    expect(puedeEditar('administrador', 'nombre')).toBe(true);
    expect(puedeEditar('administrador', 'zonaHoraria')).toBe(true);
    // Es la respuesta del Edge cuando la regla NO está en su caché (RN-16):
    // aflojarla es una decisión de seguridad, no un ajuste de comodidad.
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

  it('el administrador que intenta la contingencia del Edge recibe el motivo, no un 500', () => {
    const r = validarCambios('administrador', { politicaContingenciaEdge: 'escalar_portero' });
    expect(r).toHaveLength(1);
    expect(r[0]?.clave).toBe('politicaContingenciaEdge');
  });

  it('devuelve TODOS los rechazos, no el primero', () => {
    const r = validarCambios('superadministrador', {
      nombre: '',
      zonaHoraria: 'Marte/Olympus',
      direccion: 'Cl 4',
    });
    expect(r).toHaveLength(3);
  });

  it('acepta un lote correcto', () => {
    expect(
      validarCambios('superadministrador', {
        nombre: 'Parcelación El Roble',
        direccion: 'Km 12 Via Silvania',
        zonaHoraria: 'America/Bogota',
        politicaContingenciaEdge: 'escalar_portero',
      }),
    ).toHaveLength(0);
  });
});

describe('qué llega a la auditoría', () => {
  it('reenviar el formulario sin tocar nada NO es un cambio', () => {
    // Si lo fuera, `auditoria_seguridad` se llenaría de ruido justo en la tabla
    // que se consulta durante un incidente.
    expect(
      cambiosEfectivos(ACTUAL, { nombre: 'Villas del Bosque', zonaHoraria: 'America/Bogota' }),
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
    const efectivos = cambiosEfectivos(ACTUAL, { nombre: 'Villas del Norte' });
    expect(resumenDeCambios(ACTUAL, efectivos)).toBe(
      'nombre: Villas del Bosque → Villas del Norte',
    );
  });
});
