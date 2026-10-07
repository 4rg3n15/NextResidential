import { describe, expect, it } from 'vitest';
import { ConsentimientoBiometrico, esExito, esFallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { COP, PERSONA, ctx, entrada, montar } from './dobles-del-rostro';

/**
 * 15-X · D3 · el rostro de un MENOR en la biometría, con los dobles en memoria:
 * lo autoriza la cuenta del titular del hogar como representante legal y lo
 * retira ella, o la que la sucede; el consentimiento de una visita del menor no
 * lo toca ningún representante; y a los 18 el ya mayor lo confirma desde su
 * propia cuenta (D-10).
 */
const MENOR = PERSONA;
const TITULAR = 'cuenta-titular-1';
const SUCESOR = 'cuenta-titular-2';
const comoTitular: ContextoTenant = { ...ctx, usuarioId: TITULAR };
const comoSucesor: ContextoTenant = { ...ctx, usuarioId: SUCESOR };
const delMenor = (representanteId = TITULAR) => ({ ...entrada(), representanteId });

const registrar = async (m: ReturnType<typeof montar>, quien = comoTitular, rep = TITULAR) => {
  const r = await m.rostro.registrar(quien, delMenor(rep));
  if (!esExito(r) || !r.valor.registrado) throw new Error(JSON.stringify(r));
  return r.valor;
};

describe('15-X · D3 · el rostro de un menor, por su representante legal', () => {
  it('alta: la autorización del representante, con su cuenta como autora, en los equipos', async () => {
    const m = montar();
    const r = await registrar(m);
    expect(await m.consentimientos.vigenteDe(COP, MENOR)).toMatchObject({
      titularId: MENOR,
      origen: 'autorizado_por_representante_legal',
      declaradoPor: TITULAR,
      estado: 'vigente',
    });
    expect(m.espia.recibidas.sort()).toEqual([`t-1/${r.plantillaId}`, `t-2/${r.plantillaId}`]);
  });

  it('renovar reutiliza la autorización de ESE representante y saca la foto anterior', async () => {
    const m = montar();
    const primera = await registrar(m);
    const autorizacion = await m.consentimientos.vigenteDe(COP, MENOR);
    const segunda = await registrar(m);
    expect(segunda.reemplazada).toBe(primera.plantillaId);
    expect((await m.consentimientos.vigenteDe(COP, MENOR))?.id).toBe(autorizacion?.id);
  });

  it('con la de OTRO representante vigente, 409; el que lo sucede la retira y registra la suya', async () => {
    const m = montar();
    await registrar(m);
    const r = await m.rostro.registrar(comoSucesor, delMenor(SUCESOR));
    expect(esFallo(r) && r.error.detalle).toMatch(/otro representante/);
    expect(await m.rostro.retirar(comoSucesor, MENOR, SUCESOR)).toEqual({ ok: true, valor: true });
    await registrar(m, comoSucesor, SUCESOR);
    expect((await m.consentimientos.vigenteDe(COP, MENOR))?.declaradoPor).toBe(SUCESOR);
  });

  it('retirar como representante: revoca la autorización, suprime y retira de los equipos', async () => {
    const m = montar();
    const r = await registrar(m);
    expect(await m.rostro.retirar(comoTitular, MENOR, TITULAR)).toEqual({ ok: true, valor: true });
    expect(await m.consentimientos.vigenteDe(COP, MENOR)).toBeNull();
    expect((await m.plantillas.porId(COP, r.plantillaId))?.estado).toBe('suprimida');
    expect(m.espia.retiradas.sort()).toEqual([`t-1/${r.plantillaId}`, `t-2/${r.plantillaId}`]);
    // Ya no queda nada que retirar.
    expect(await m.rostro.retirar(comoTitular, MENOR, TITULAR)).toEqual({ ok: true, valor: false });
  });

  it('el consentimiento de una VISITA del menor: ni se registra encima (409) ni lo revoca él', async () => {
    const m = montar();
    const casilla = ConsentimientoBiometrico.declarar({
      id: 'c-visita',
      copropiedadId: COP,
      titularId: MENOR,
      finalidad: 'control_acceso',
      versionPolitica: 'casilla-v1',
      canal: 'app',
      declaradoPor: 'cuenta-portero',
      ahora: new Date('2026-10-01T12:00:00Z'),
    });
    if (!esExito(casilla)) throw new Error('casilla');
    await m.consentimientos.guardar(casilla.valor);
    const r = await m.rostro.registrar(comoTitular, delMenor());
    expect(esFallo(r) && r.error.detalle).toMatch(/otro consentimiento vigente/);
    expect(await m.rostro.retirar(comoTitular, MENOR, TITULAR)).toEqual({ ok: true, valor: false });
    expect((await m.consentimientos.vigenteDe(COP, MENOR))?.id).toBe('c-visita');
  });

  it('a los 18, el ya mayor registra el suyo desde su cuenta y CONFIRMA la autorización', async () => {
    const m = montar();
    await registrar(m);
    const r = await m.rostro.registrar(ctx, entrada());
    expect(esExito(r) && r.valor.registrado).toBe(true);
    expect(await m.consentimientos.vigenteDe(COP, MENOR)).toMatchObject({
      origen: 'otorgado_por_el_titular',
      declaradoPor: TITULAR,
    });
  });
});
