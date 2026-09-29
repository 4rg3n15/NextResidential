import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// El guion de `pnpm sitio:ensayo -- --capturar | --restaurar`, tal cual.
import { respaldar, restaurar } from '../../../../scripts/lib/respaldo-en-sitio.mjs';
import {
  capturarRespaldo,
  ficheroDelRespaldo,
  leerSerieDelEquipo,
  llaveDelRespaldo,
  respaldoPara,
  restaurarRespaldo,
} from './respaldo-de-configuracion';
import { montarEnsayoSimulado } from '../simulacion/ensayo-simulado';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { EquipoDeEnsayo } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OTROS FALLOS (15-M) · RESPALDO Y REVERSIÓN POR SERIE, CON N EQUIPOS
 *
 * El ensayo simulado lo destapó: los seis equipos decían la misma serie, la
 * segunda cámara pisaba el respaldo de la primera sin decirlo, y la reversión
 * de la cámara y la terminal encontraba el fichero del videoportero —misma
 * serie, otra familia— y fallaba entero. La llave es familia + serie, y dos
 * fichas que dan la misma serie en una corrida se dicen, no se pisan.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const P = {
  capturarRespaldo,
  restaurarRespaldo,
  leerSerieDelEquipo,
  ficheroDelRespaldo,
  llaveDelRespaldo,
  respaldoPara,
};

const carpetas: string[] = [];
const carpetaNueva = (): string => {
  const c = mkdtempSync(join(tmpdir(), 'ncr-respaldo-'));
  carpetas.push(c);
  return c;
};
afterEach(() => {
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true });
});

describe('las piezas del respaldo por serie', () => {
  it('el fichero lleva familia y serie, y la serie sólo con caracteres seguros', () => {
    expect(ficheroDelRespaldo('camara', 'DS-TCG406/E 2024')).toBe('camara-DS-TCG406_E_2024.json');
    expect(ficheroDelRespaldo('terminal', '../../etc')).toBe('terminal-.._.._etc.json');
  });

  it('nunca devuelve el respaldo de otra familia aunque la serie coincida', () => {
    const respaldos = [
      { familia: 'videoportero' as const, serie: 'X1' },
      { familia: 'camara' as const, serie: 'X2' },
    ];
    expect(respaldoPara(respaldos, 'camara', 'X1')).toBeNull();
    expect(respaldoPara(respaldos, 'videoportero', 'X1')).toBe(respaldos[0]);
    expect(llaveDelRespaldo('camara', 'X1')).not.toBe(llaveDelRespaldo('videoportero', 'X1'));
  });
});

describe('el guion de respaldo contra los seis equipos simulados', () => {
  it('un fichero por equipo, y la reversión encuentra el de CADA uno sin fallos', async () => {
    const sim = await montarEnsayoSimulado(() => undefined);
    const lineas: string[] = [];
    const carpeta = carpetaNueva();
    try {
      expect(
        await respaldar({ P, equipos: sim.equipos, carpeta, decir: (l) => lineas.push(l) }),
      ).toBe(0);
      expect(readdirSync(carpeta).sort()).toEqual([
        'camara-SIM-camara-1.json',
        'camara-SIM-camara-2.json',
        'terminal-SIM-terminal-1.json',
        'terminal-SIM-terminal-2.json',
        'videoportero-SIM-videoportero-1.json',
        'videoportero-SIM-videoportero-2.json',
      ]);

      const reversion: string[] = [];
      expect(
        await restaurar({ P, equipos: sim.equipos, carpeta, decir: (l) => reversion.push(l) }),
      ).toBe(0);
      expect(reversion.filter((l) => l.includes('✗'))).toEqual([]);
      expect(reversion.filter((l) => l.includes('igual'))).toHaveLength(12);
    } finally {
      await sim.cerrar();
    }
  });

  it('una cámara y un videoportero con la MISMA serie: cada uno recupera el suyo', async () => {
    const equipo = (familia: EquipoDeEnsayo['familia']): EquipoDeEnsayo => ({
      familia,
      nombre: `${familia} con serie repetida`,
      host: `${familia}.serie.invalid`,
      usuario: 'servicio',
      clave: 'p1',
      puerta: 1,
      canalDeVideo: '102',
      puertoRtsp: 554,
      peticion: equipoSimulado({ familia, usuario: 'servicio', clave: 'p1', serie: 'MISMA-01' }),
    });
    const equipos = [equipo('camara'), equipo('videoportero')];
    const carpeta = carpetaNueva();
    expect(await respaldar({ P, equipos, carpeta, decir: () => undefined })).toBe(0);
    const reversion: string[] = [];
    expect(await restaurar({ P, equipos, carpeta, decir: (l) => reversion.push(l) })).toBe(0);
    expect(reversion.join('\n')).not.toMatch(/OTRO equipo/);
  });

  it('dos fichas que apuntan al MISMO aparato: la segunda no pisa a la primera, y se dice', async () => {
    const sim = await montarEnsayoSimulado(() => undefined);
    const camara = sim.equipos.find((e) => e.familia === 'camara');
    if (camara === undefined) throw new Error('sin cámara simulada');
    const lineas: string[] = [];
    const carpeta = carpetaNueva();
    try {
      const repetida = { ...camara, nombre: 'Cámara duplicada' };
      expect(
        await respaldar({ P, equipos: [camara, repetida], carpeta, decir: (l) => lineas.push(l) }),
      ).toBe(1);
      expect(readdirSync(carpeta)).toEqual(['camara-SIM-camara-1.json']);
      expect(lineas.join('\n')).toMatch(
        /✗ camara «Cámara duplicada»: da la misma serie SIM-camara-1 que camara «Cámara entrada»/,
      );
    } finally {
      await sim.cerrar();
    }
  });
});
