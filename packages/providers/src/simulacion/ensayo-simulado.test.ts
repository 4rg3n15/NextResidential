import { describe, expect, it } from 'vitest';
import {
  SECRETO_DEL_RECEPTOR_SIMULADO,
  SECRETO_DEL_RECEPTOR_SIMULADO_2,
  montarEnsayoSimulado,
} from './ensayo-simulado';
import { ensayarEquipo } from '../ensayo/ensayo-en-sitio';
import type { InformeDeEnsayo } from '../ensayo/ensayo-en-sitio';
import { lineasDelInforme, recuentoDe } from '../ensayo/informe-de-ensayo';
import {
  juzgarConexionDePgBoss,
  juzgarProveedorDeEquipos,
} from '../ensayo/comprobaciones-de-plataforma';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';

/**
 * `pnpm sitio:ensayo -- --simulado`, montado como lo monta el guion: los tres
 * equipos, la plataforma simulada y las comprobaciones nuevas (C1, C2, C7, F2,
 * F3, F4). Tiene que terminar SIN FALLOS: si no, el guion tampoco, y el paso
 * 12f de `verificar-etapa.sh` se pone en rojo.
 */
describe('el ensayo simulado entero, como lo corre el guion', () => {
  it('SEIS equipos (dos por familia), nueve pasos cada uno, la plataforma, y ningún FALLO', async () => {
    const avisos: string[] = [];
    const sim = await montarEnsayoSimulado((l) => avisos.push(l));
    const informes: InformeDeEnsayo[] = [];
    try {
      for (const equipo of sim.equipos) {
        informes.push(
          await ensayarEquipo(
            {
              equipo,
              interlocutor: sim.interlocutorDe(equipo.familia, equipo),
              soloLectura: false,
              plataforma: sim.plataforma,
              verificaciones: sim.verificacionesDe(equipo),
              ...(equipo.familia === 'camara'
                ? { receptorEsperado: sim.receptorEsperadoDe(equipo) }
                : {}),
              esperaDeEventoMs: 5000,
              esperaDeSincronizacionMs: 10,
              limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
              zona: 'America/Bogota',
              ahora: () => new Date(),
            },
            async () => undefined,
          ),
        );
      }
    } finally {
      await sim.cerrar();
    }
    const comprobaciones = [
      juzgarProveedorDeEquipos(sim.entorno, sim.equiposReales),
      juzgarConexionDePgBoss(sim.entorno),
    ];
    const texto = informes.flatMap((i) => lineasDelInforme(i, [])).join('\n');
    expect(recuentoDe(informes, comprobaciones).fallo, texto).toBe(0);
    // C6 · seis pasos de equipo: dos cámaras, dos terminales, dos videoporteros,
    // cada uno con el nombre de su ficha; y las dos cámaras con secretos DISTINTOS.
    expect(informes).toHaveLength(6);
    expect(informes.map((i) => i.familia)).toEqual([
      'camara',
      'camara',
      'terminal',
      'terminal',
      'videoportero',
      'videoportero',
    ]);
    expect(informes.map((i) => i.nombre)).toContain('Cámara salida');
    const camaras = sim.equipos.filter((e) => e.familia === 'camara');
    expect(camaras.map((c) => sim.receptorEsperadoDe(c).secretos[0])).toEqual([
      SECRETO_DEL_RECEPTOR_SIMULADO,
      SECRETO_DEL_RECEPTOR_SIMULADO_2,
    ]);
    expect(
      informes
        .filter((i) => i.familia === 'camara')
        .every((i) => i.pasos.every((p) => p.estado !== 'fallo')),
    ).toBe(true);
    const paso = (familia: string, nombre: string) =>
      informes.find((i) => i.familia === familia)?.pasos.find((p) => p.paso === nombre);
    // C2 · la cámara publica en «este Mac» de la red simulada, y no enseña el secreto.
    expect(paso('camara', 'eventos')?.detalle[0]).toMatch(
      /este Mac hacia la cámara: 198\.51\.100\.10/,
    );
    expect(texto).toMatch(/\/alarm-server\/••••/);
    expect(texto).not.toMatch(/secreto-simulado/);
    expect(texto).not.toMatch(/segunda-camara/);
    // F2 · cinco ciclos completos en la terminal.
    expect(paso('terminal', 'verificacion')?.estado).toBe('ok');
    // F4 · el videoportero con biblioteca da de alta y de baja su rostro de prueba.
    expect(paso('videoportero', 'rostro')?.estado).toBe('ok');
    expect(comprobaciones.map((c) => c.estado)).toEqual(['ok', 'ok']);
    expect(avisos.some((a) => /Presente el rostro/.test(a))).toBe(true);
    // C6 · seis equipos con nueve pasos son más de 5 s: el plazo es del ensayo, no del código.
  }, 60_000);
});
