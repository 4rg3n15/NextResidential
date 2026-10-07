import { describe, expect, it } from 'vitest';
import { Placa } from '@ncr/domain-core';
import { EdicionDeVehiculosPropiosPg } from '../src/residente/infraestructura/vehiculos-propios-edicion-pg';
import { COP_A } from './utilidades';
import { SUPER, bancoDelHogar } from './banco-del-hogar-pg';
import type { Sesion } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D5 · EL RESIDENTE EDITA Y ELIMINA SUS VEHÍCULOS (D-W5)
 *
 * Antes sólo los registraba. Ahora los edita —la placa, sólo sin historial,
 * por el objeto de valor `Placa` y el índice único parcial (ADR-04)— y los
 * elimina: sin historial se borran de verdad; con él, baja lógica (RN-19). El
 * vehículo se busca en la vivienda del ámbito: el del vecino responde 404. El
 * tipo, la vivienda y el estado no se eligen: 400 por forma.
 *
 * Contra la base real. El «historial» es un paso por la portería con su placa,
 * que monta el superusuario: no es lo que se prueba.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;
const RUTA = `/copropiedades/${COP_A}/mi/vehiculos`;

describe('15-W · D5 · editar y eliminar un vehículo propio', () => {
  const s = banco.sufijo;
  const placa = (prefijo: string): string => `${prefijo}${s.slice(-4)}`;
  let suyo: Sesion = { usuarioId: '', token: '' };
  let vecino: Sesion = { usuarioId: '', token: '' };
  let viviendaId = '';
  let ocupantes: string[] = [];
  let v1 = '';
  let v2 = '';
  const dato = async (sql: string, p: unknown[]) => banco.uno<Record<string, string>>(sql, p);

  it('prepara: su vivienda con dos ocupantes —él y un menor— y dos vehículos; un vecino en otra', async () => {
    if (omitida()) return;
    viviendaId = await banco.vivienda(COP_A, `E${s}`);
    suyo = await banco.titular(COP_A, viviendaId, `veh1.${s}`);
    await banco.completarAlta(COP_A, suyo.token, banco.perfil(1));
    const hogar = `/copropiedades/${COP_A}/mi`;
    const plazas = await banco.con(suyo.token, 'post', `${hogar}/ocupantes`, { numero: 2 });
    const libre = plazas.body.plazas.find((p: { libre: boolean }) => p.libre) as { id: string };
    const menor = await banco.con(suyo.token, 'post', `${hogar}/menores`, {
      nombres: 'Tomás',
      apellidos: `Prueba ${s}`,
      fechaNacimiento: '2016-04-09',
      tipoDocumento: 'tarjeta_identidad',
      numeroDocumento: `6${s}1`,
      parentesco: 'Hijo',
      plazaId: libre.id,
    });
    expect(menor.status, JSON.stringify(menor.body)).toBe(201);
    const familia = await banco.con(suyo.token, 'get', `${hogar}/familia`);
    ocupantes = familia.body.map((m: { residenteId: string }) => m.residenteId);
    expect(ocupantes).toHaveLength(2);
    vecino = await banco.titular(COP_A, await banco.vivienda(COP_A, `F${s}`), `veh2.${s}`);
    await banco.completarAlta(COP_A, vecino.token, banco.perfil(2));
    const alta = (p: string) =>
      banco.con(suyo.token, 'post', RUTA, {
        placa: p,
        color: 'Gris',
        modelo: 'Mazda 3',
        tipo: 'automovil',
        ocupantes: [ocupantes[0]],
      });
    const conPlaca = await alta(placa('V1'));
    const sinUso = await alta(placa('V2'));
    expect(conPlaca.body.registrado, JSON.stringify(conPlaca.body)).toBe(true);
    expect(sinUso.body.registrado, JSON.stringify(sinUso.body)).toBe(true);
    v1 = String(conPlaca.body.id);
    v2 = String(sinUso.body.id);
  });

  it('sin historial la placa cambia por el objeto de valor; tipo, vivienda o estado → 400; la de otro activo → 409', async () => {
    if (omitida()) return;
    const editado = await banco.con(suyo.token, 'put', `${RUTA}/${v1}`, {
      color: 'Azul',
      modelo: 'Mazda 2',
      placa: ` ${placa('V9').toLowerCase()} `,
      ocupantes,
    });
    expect(editado.status, JSON.stringify(editado.body)).toBe(200);
    expect(editado.body).toEqual({ editado: true });
    expect(
      await dato(
        `SELECT v.placa, v.color,
                (SELECT count(*)::text FROM public.vehiculos_ocupantes o
                  WHERE o.vehiculo_id = v.id AND o.estado = 'activo') AS ocupantes
           FROM public.vehiculos v WHERE v.id = $1`,
        [v1],
      ),
    ).toEqual({ placa: placa('V9'), color: 'Azul', ocupantes: '2' });
    for (const intruso of [{ tipo: 'moto' }, { viviendaId }, { estado: 'activo' }]) {
      const r = await banco.con(suyo.token, 'put', `${RUTA}/${v1}`, {
        color: 'Azul',
        modelo: 'Mazda 2',
        ...intruso,
      });
      expect(r.status, JSON.stringify(intruso)).toBe(400);
    }
    const duplicada = await banco.con(suyo.token, 'put', `${RUTA}/${v2}`, {
      color: 'Rojo',
      modelo: 'Kia Rio',
      placa: placa('V9'),
    });
    expect(duplicada.status, JSON.stringify(duplicada.body)).toBe(409);
  });

  it('con historial la placa ya no cambia —una placa nueva es otro vehículo—; lo demás, sí', async () => {
    if (omitida()) return;
    await banco.pool.query(
      `INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, metodo, dispositivo_id,
                                   regla_aplicada, version_reglas, clave_idempotencia, creado_por, placa_detectada)
       VALUES ($1, now(), 'ingreso', 'permitido', 'placa', '90000000-0000-4000-8000-000000000001',
               'prueba-15w-d5', 1, $2, $3, $4)`,
      [COP_A, `d5-${s}`, SUPER, placa('V9')],
    );
    const otraPlaca = await banco.con(suyo.token, 'put', `${RUTA}/${v1}`, {
      color: 'Negro',
      modelo: 'Mazda 2',
      placa: placa('V8'),
    });
    expect(otraPlaca.status).toBe(409);
    expect(JSON.stringify(otraPlaca.body)).toContain(
      'Dé de baja este vehículo y registre el nuevo',
    );
    const lodemas = { color: 'Negro', modelo: 'Mazda 2' };
    expect((await banco.con(suyo.token, 'put', `${RUTA}/${v1}`, lodemas)).status).toBe(200);
  });

  it('el historial que llega DESPUÉS de la comprobación previa tampoco se salta: lo decide el UPDATE', async () => {
    if (omitida()) return;
    // Directo al adaptador, sin la comprobación del caso de uso: es lo que vería
    // una edición cuyo evento llegó entre la comprobación y el cambio.
    const repo = new EdicionDeVehiculosPropiosPg(banco.pool).deLaVivienda(
      { copropiedadId: COP_A, viviendaId },
      suyo.usuarioId,
    );
    const nueva = Placa.crear(placa('V7'));
    if (!nueva.ok) throw new Error(nueva.error.detalle);
    const r = await repo.editarVehiculo({
      copropiedadId: COP_A,
      vehiculoId: v1,
      placa: nueva.valor,
      color: 'Blanco',
      actorId: suyo.usuarioId,
    });
    expect(r).toEqual({ tipo: 'placa_con_historial' });
    expect(await dato('SELECT placa, color FROM public.vehiculos WHERE id = $1', [v1])).toEqual({
      placa: placa('V9'),
      color: 'Negro',
    });
  });

  it('el del vecino no existe para quien no es de su vivienda: 404, y nada cambia', async () => {
    if (omitida()) return;
    const cambio = { color: 'Verde', modelo: 'Otro' };
    expect((await banco.con(vecino.token, 'put', `${RUTA}/${v1}`, cambio)).status).toBe(404);
    expect((await banco.con(vecino.token, 'delete', `${RUTA}/${v1}`)).status).toBe(404);
    expect((await dato('SELECT color FROM public.vehiculos WHERE id = $1', [v1]))?.color).toBe(
      'Negro',
    );
  });

  it('eliminar: sin historial se borra, con historial se da de baja; dos veces, 404; todo en la bitácora', async () => {
    if (omitida()) return;
    const borrado = await banco.con(suyo.token, 'delete', `${RUTA}/${v2}`);
    expect(borrado.body, JSON.stringify(borrado.body)).toEqual({ resultado: 'borrado' });
    expect(await dato('SELECT 1 AS hay FROM public.vehiculos WHERE id = $1', [v2])).toBeUndefined();
    const deBaja = await banco.con(suyo.token, 'delete', `${RUTA}/${v1}`);
    expect(deBaja.body, JSON.stringify(deBaja.body)).toEqual({ resultado: 'dado_de_baja' });
    expect(
      (await dato('SELECT estado::text AS estado FROM public.vehiculos WHERE id = $1', [v1]))
        ?.estado,
    ).toBe('inactivo');
    expect((await banco.con(suyo.token, 'delete', `${RUTA}/${v1}`)).status).toBe(404);
    const rastro = await dato(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo IN ('vehiculo_propio_editado', 'vehiculo_propio_borrado')`,
      [viviendaId],
    );
    expect(rastro?.n).toBe('3');
  });
});
