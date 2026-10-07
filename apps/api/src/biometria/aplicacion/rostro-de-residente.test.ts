import { describe, expect, it } from 'vitest';
import { esExito } from '@ncr/domain-core';
import { COP, PERSONA, ctx, entrada, montar } from './dobles-del-rostro';

/**
 * 15-X · D2 · el rostro de un residente en la biometría, con los dobles en
 * memoria: alta con consentimiento OTORGADO por él, reemplazo con el anterior
 * fuera de los equipos en el acto, conflicto optimista, retiro y lectura.
 */
const registrado = async (m: ReturnType<typeof montar>) => {
  const r = await m.rostro.registrar(ctx, entrada());
  if (!esExito(r) || !r.valor.registrado) throw new Error(JSON.stringify(r));
  return r.valor;
};

describe('15-X · D2 · RostroDeResidente', () => {
  it('alta: consentimiento OTORGADO por el titular, en los dos equipos, y se lee sin imagen', async () => {
    const m = montar();
    const r = await registrado(m);
    const c = await m.consentimientos.vigenteDe(COP, PERSONA);
    expect(c).toMatchObject({ origen: 'otorgado_por_el_titular', canal: 'app', estado: 'vigente' });
    expect(m.espia.recibidas.sort()).toEqual([`t-1/${r.plantillaId}`, `t-2/${r.plantillaId}`]);
    const leido = await m.rostro.leer(ctx, PERSONA);
    expect(leido.plantilla?.plantillaId).toBe(r.plantillaId);
    expect(leido.equipos).toEqual([
      { nombre: 'Terminal', estado: 'sincronizada' },
      { nombre: 'Videoportero', estado: 'sincronizada' },
    ]);
    expect(JSON.stringify(leido)).not.toMatch(/vector|255,216/);
  });

  it('reemplazo: reutiliza el consentimiento y saca el anterior de los equipos en el acto', async () => {
    const m = montar();
    const primera = await registrado(m);
    const segunda = await registrado(m);
    expect(segunda.reemplazada).toBe(primera.plantillaId);
    expect((await m.plantillas.porId(COP, primera.plantillaId))?.estado).toBe('suprimida');
    expect(m.espia.retiradas.sort()).toEqual([
      `t-1/${primera.plantillaId}`,
      `t-2/${primera.plantillaId}`,
    ]);
    expect((await m.rostro.leer(ctx, PERSONA)).plantilla?.plantillaId).toBe(segunda.plantillaId);
  });

  it('si otro registro ganó entre la lectura y el reemplazo: en conflicto, sin tocar nada', async () => {
    const m = montar();
    await registrado(m);
    // Otro registro de la misma persona gana mientras éste prepara el suyo.
    const original = m.memoria.vivaDe.bind(m.memoria);
    let leida = false;
    m.memoria.vivaDe = async (cop, p) => {
      const v = await original(cop, p);
      if (!leida) {
        leida = true;
        await registrado({ ...m, rostro: m.rostro });
      }
      return v;
    };
    const r = await m.rostro.registrar(ctx, entrada());
    expect(esExito(r) && r.valor).toEqual({ registrado: false, enConflicto: true });
  });

  it('dos PRIMERAS capturas a la vez: la segunda en conflicto, sin dejar un consentimiento huérfano', async () => {
    const m = montar();
    // La segunda lee «sin consentimiento» y, antes de guardar, la primera termina entera.
    const original = m.consentimientos.vigenteDe.bind(m.consentimientos);
    let leida = false;
    m.consentimientos.vigenteDe = async (cop, p) => {
      const v = await original(cop, p);
      if (!leida) {
        leida = true;
        await registrado(m);
      }
      return v;
    };
    const r = await m.rostro.registrar(ctx, entrada());
    expect(esExito(r) && r.valor).toEqual({ registrado: false, enConflicto: true });
    // Un consentimiento huérfano sobreviviría al retiro: el titular retira y no queda ninguno.
    expect(await m.rostro.retirar(ctx, PERSONA)).toEqual({ ok: true, valor: true });
    expect(await original(COP, PERSONA)).toBeNull();
  });

  it('una foto que no sirve: los motivos, y ni consentimiento ni plantilla', async () => {
    const m = montar();
    const r = await m.rostro.registrar(
      ctx,
      entrada({ rostrosDetectados: 0, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 }),
    );
    expect(esExito(r) && !r.valor.registrado && 'motivos' in r.valor).toBe(true);
    expect(await m.consentimientos.vigenteDe(COP, PERSONA)).toBeNull();
  });

  it('retirar: revoca, suprime y retira; sin nada, `false`', async () => {
    const m = montar();
    expect(await m.rostro.retirar(ctx, PERSONA)).toEqual({ ok: true, valor: false });
    const r = await registrado(m);
    expect(await m.rostro.retirar(ctx, PERSONA)).toEqual({ ok: true, valor: true });
    expect(await m.consentimientos.vigenteDe(COP, PERSONA)).toBeNull();
    expect((await m.plantillas.porId(COP, r.plantillaId))?.estado).toBe('suprimida');
    expect(m.espia.retiradas.sort()).toEqual([`t-1/${r.plantillaId}`, `t-2/${r.plantillaId}`]);
    expect((await m.rostro.leer(ctx, PERSONA)).plantilla).toBeNull();
  });

  it('las capturas de la cuenta, para el tope de 24 h', async () => {
    const m = montar();
    await registrado(m);
    await registrado(m);
    const ahora = new Date('2026-10-08T13:00:00Z');
    expect(await m.rostro.capturasRecientes(COP, 'cuenta-1', ahora)).toHaveLength(2);
    expect(await m.rostro.capturasRecientes(COP, 'otra-cuenta', ahora)).toHaveLength(0);
  });
});
