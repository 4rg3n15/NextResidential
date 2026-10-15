import { afterEach, describe, expect, it, vi } from 'vitest';
import { compartirTexto, textoDeCodigoDePlaza } from './compartir';

/** 15-Y2 · la hoja de compartir cuando existe; si no, el portapapeles; nunca a escondidas. */
afterEach(() => vi.unstubAllGlobals());

describe('compartirTexto', () => {
  it('con Web Share, comparte', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true, clipboard: { writeText: vi.fn() } });
    expect(await compartirTexto('MIRA-K7PQ-2XWZ')).toBe('compartido');
    expect(share).toHaveBeenCalledWith({
      title: 'Next Control Residencial',
      text: 'MIRA-K7PQ-2XWZ',
    });
  });

  it('si la hoja se cierra sin elegir, «cancelado» y NO se copia', async () => {
    const writeText = vi.fn();
    const share = vi.fn(async () => {
      const e = new Error('abort');
      e.name = 'AbortError';
      throw e;
    });
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });
    expect(await compartirTexto('x')).toBe('cancelado');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('sin Web Share, copia al portapapeles; sin ninguno de los dos, lo dice', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await compartirTexto('MIRA-K7PQ-2XWZ')).toBe('copiado');
    expect(writeText).toHaveBeenCalledWith('MIRA-K7PQ-2XWZ');
    vi.stubGlobal('navigator', {});
    expect(await compartirTexto('x')).toBe('sin_medio');
  });

  it('el texto del código dice qué es y dónde se usa, sin más datos', () => {
    const t = textoDeCodigoDePlaza('MIRA-K7PQ-2XWZ', 'Casa 01');
    expect(t).toContain('MIRA-K7PQ-2XWZ');
    expect(t).toContain('Casa 01');
    expect(t).toContain('«Crear cuenta»');
  });
});
