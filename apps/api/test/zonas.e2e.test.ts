import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Aforo, HorarioDeZona, Zona, esExito } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { RepositorioZonasEnMemoria } from '../src/zonas/infraestructura/repositorio-zonas-memoria';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * CU-05 por HTTP: configurar la zona, entrar hasta llenarla, chocar con el
 * aforo, salir y volver a entrar.
 */
const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};

const ZONA = '80000000-0000-4000-8000-000000000003';
const BOGOTA = -300;

let app: INestApplication;
let firmante: Firmante;
let token: string;
let repo: RepositorioZonasEnMemoria;

/** Zona sin restricción horaria: aquí se prueba el aforo, no el reloj. */
const zonaDePrueba = (maximo: number, actual = 0): Zona =>
  abrir(
    Zona.crear({
      id: ZONA,
      copropiedadId: COP_A,
      nombre: 'Salón social',
      tipo: 'comun',
      horario: abrir(HorarioDeZona.crear([], BOGOTA)),
      aforo: abrir(Aforo.crear(maximo, actual)),
    }),
  );

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  repo = app.get(RepositorioZonasEnMemoria);
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  repo.declarar(zonaDePrueba(2));
});

const con = (metodo: 'get' | 'post', ruta: string) =>
  request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${token}`);

describe('zonas · CU-05 por HTTP', () => {
  it('lista las zonas con su aforo y su disponibilidad (HU-19)', async () => {
    const r = await con('get', `/copropiedades/${COP_A}/zonas`).expect(200);
    const zona = r.body.find((z: { id: string }) => z.id === ZONA);
    expect(zona).toMatchObject({
      nombre: 'Salón social',
      aforoMaximo: 2,
      aforoActual: 0,
      dentroDeHorario: true,
      aforoCompleto: false,
    });
  });

  it('admite hasta el aforo EXACTO y deniega el siguiente (CA-14)', async () => {
    const ruta = `/copropiedades/${COP_A}/zonas/${ZONA}/ingresos`;
    // La forma de la respuesta es FIJA desde la ETAPA 09-B: los tres campos
    // salen siempre, con `null` donde no aplican. Antes `conteo` y `motivo`
    // aparecían y desaparecían según el veredicto, y un campo que a veces no
    // está obliga a la consola a distinguir «ausente» de «cero» en cada uso.
    expect((await con('post', ruta).expect(201)).body).toEqual({
      admitido: true,
      conteo: 1,
      motivo: null,
    });
    expect((await con('post', ruta).expect(201)).body).toEqual({
      admitido: true,
      conteo: 2,
      motivo: null,
    });
    // La denegación es 201 con motivo, no un error: el intento es legítimo y su
    // respuesta es una decisión de negocio que además va a un evento (RN-02).
    expect((await con('post', ruta).expect(201)).body).toEqual({
      admitido: false,
      conteo: null,
      motivo: 'AFORO_SUPERADO',
    });
  });

  it('salir deja sitio para entrar otra vez', async () => {
    const ingresos = `/copropiedades/${COP_A}/zonas/${ZONA}/ingresos`;
    const salidas = `/copropiedades/${COP_A}/zonas/${ZONA}/salidas`;
    await con('post', ingresos);
    await con('post', ingresos);

    expect((await con('post', salidas).expect(201)).body).toEqual({ conteo: 1 });
    expect((await con('post', ingresos).expect(201)).body.admitido).toBe(true);
  });

  it('salir con el contador en cero no lo deja negativo (CU-05 6a)', async () => {
    const salidas = `/copropiedades/${COP_A}/zonas/${ZONA}/salidas`;
    expect((await con('post', salidas).expect(201)).body).toEqual({ conteo: 0 });
  });

  it('el cierre manual del operador deniega por horario (HU-18, PB-04)', async () => {
    await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/configuracion`)
      .send({ abierta: false })
      .expect(201);

    expect((await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/ingresos`)).body).toEqual({
      admitido: false,
      conteo: null,
      motivo: 'FUERA_DE_HORARIO',
    });
  });

  it('configurar el horario cambia la disponibilidad (HU-18, CA-15)', async () => {
    // Solo los lunes de 08:00 a 09:00: fuera de esa franja, cerrada.
    const r = await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/configuracion`)
      .send({ horario: [{ dia: 1, minutoInicio: 480, minutoFin: 540 }] })
      .expect(201);
    expect(r.body.aforoMaximo).toBe(2);

    const zona = await repo.porId(COP_A, ZONA);
    expect(zona?.horario.franjas.length).toBe(1);
  });

  it('S-09 · el horario que cruza la medianoche se acepta con dos franjas', async () => {
    await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/configuracion`)
      .send({
        horario: [
          { dia: 5, minutoInicio: 1320, minutoFin: 1440 },
          { dia: 6, minutoInicio: 0, minutoFin: 60, continuaDelDiaAnterior: true },
        ],
      })
      .expect(201);

    const zona = await repo.porId(COP_A, ZONA);
    expect(zona?.horario.franjas.map((f) => f.dia)).toEqual([5, 6]);
  });

  it('una franja que cruza la medianoche en UNA fila se rechaza (400)', async () => {
    await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/configuracion`)
      .send({ horario: [{ dia: 5, minutoInicio: 1320, minutoFin: 60 }] })
      .expect(400);
  });

  it('bajar el aforo por debajo del conteo se rechaza en vez de corromper la fila', async () => {
    repo.declarar(zonaDePrueba(10, 6));
    await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/configuracion`)
      .send({ aforoMaximo: 3 })
      .expect(409);
  });

  it('subir el aforo NO vacía el contador', async () => {
    repo.declarar(zonaDePrueba(10, 6));
    const r = await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/configuracion`)
      .send({ aforoMaximo: 20 })
      .expect(201);
    expect(r.body).toMatchObject({ aforoMaximo: 20, aforoActual: 6 });
  });

  it('dar permiso sobre la zona a una autorización (HU-19, HU-20)', async () => {
    const r = await con('post', `/copropiedades/${COP_A}/zonas/${ZONA}/autorizaciones`)
      .send({ autorizacionId: '90000000-0000-4000-8000-0000000000aa' })
      .expect(201);
    expect(r.body).toEqual({ zonaId: ZONA });
  });

  it('una zona inexistente responde 404', async () => {
    await con(
      'post',
      `/copropiedades/${COP_A}/zonas/00000000-0000-4000-8000-0000000000ff/configuracion`,
    )
      .send({ nombre: 'X' })
      .expect(404);
  });
});

describe('zonas · aislamiento', () => {
  it('un administrador de otra copropiedad no ve ni toca estas zonas', async () => {
    const ajeno = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/zonas`)
      .set('Authorization', `Bearer ${ajeno}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/zonas/${ZONA}/ingresos`)
      .set('Authorization', `Bearer ${ajeno}`)
      .expect(404);
  });

  it('sin token no se entra a ninguna zona', async () => {
    await request(app.getHttpServer()).get(`/copropiedades/${COP_A}/zonas`).expect(401);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * O3 (ETAPA 15-D) · la consola CREA y DA DE BAJA zonas, y les pone icono
 *
 * Hasta la 15-D las zonas sólo existían si alguien las insertaba con `psql`.
 * Lo que se fija aquí es la forma del recorrido por HTTP; que persistan de
 * verdad lo prueba `test/zonas-pg.test.ts` contra la base.
 */
describe('zonas · alta, baja e icono desde la consola (O3)', () => {
  it('crea una zona con aforo e icono, que sale en el listado con `activa`', async () => {
    const creada = await con('post', `/copropiedades/${COP_A}/zonas`)
      .send({ nombre: 'Gimnasio', tipo: 'comun', aforoMaximo: 12, icono: 'dumbbell' })
      .expect(201);
    expect(creada.body).toMatchObject({
      nombre: 'Gimnasio',
      tipo: 'comun',
      aforoMaximo: 12,
      aforoActual: 0,
      icono: 'dumbbell',
      activa: true,
      // Sin franjas: abierta según política, que es lo que la pantalla dice.
      dentroDeHorario: true,
    });
    const lista = await con('get', `/copropiedades/${COP_A}/zonas`).expect(200);
    const gimnasio = lista.body.find((z: { id: string }) => z.id === creada.body.id);
    expect(gimnasio?.icono).toBe('dumbbell');
  });

  it('el icono se cambia por configuración y `null` lo quita', async () => {
    const creada = await con('post', `/copropiedades/${COP_A}/zonas`)
      .send({ nombre: 'Piscina', tipo: 'comun', aforoMaximo: 30 })
      .expect(201);
    expect(creada.body.icono).toBeNull();
    const con_icono = await con(
      'post',
      `/copropiedades/${COP_A}/zonas/${creada.body.id}/configuracion`,
    )
      .send({ icono: 'waves' })
      .expect(201);
    expect(con_icono.body.icono).toBe('waves');
    const sin_icono = await con(
      'post',
      `/copropiedades/${COP_A}/zonas/${creada.body.id}/configuracion`,
    )
      .send({ icono: null })
      .expect(201);
    expect(sin_icono.body.icono).toBeNull();
  });

  it('un icono que no es un nombre se rechaza: es un campo de pantalla, no un texto libre', async () => {
    await con('post', `/copropiedades/${COP_A}/zonas`)
      .send({ nombre: 'BBQ', tipo: 'comun', aforoMaximo: 8, icono: '<script>' })
      .expect(400);
  });

  it('la baja exige motivo, deja la zona INACTIVA y la sigue listando (RN-19)', async () => {
    const creada = await con('post', `/copropiedades/${COP_A}/zonas`)
      .send({ nombre: 'Terraza', tipo: 'comun', aforoMaximo: 20 })
      .expect(201);
    await con('post', `/copropiedades/${COP_A}/zonas/${creada.body.id}/baja`)
      .send({ motivo: 'x' })
      .expect(400);
    await con('post', `/copropiedades/${COP_A}/zonas/${creada.body.id}/baja`)
      .send({ motivo: 'Cerrada por reforma' })
      .expect(201);
    const lista = await con('get', `/copropiedades/${COP_A}/zonas`).expect(200);
    const terraza = lista.body.find((z: { id: string }) => z.id === creada.body.id);
    expect(terraza).toMatchObject({ activa: false, dentroDeHorario: false });
    // Una segunda baja no encuentra zona activa.
    await con('post', `/copropiedades/${COP_A}/zonas/${creada.body.id}/baja`)
      .send({ motivo: 'Otra vez' })
      .expect(404);
  });

  it('un portero NO crea zonas', async () => {
    const portero = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A });
    await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/zonas`)
      .set('Authorization', `Bearer ${portero}`)
      .send({ nombre: 'Sauna', tipo: 'comun', aforoMaximo: 4 })
      .expect(403);
  });
});
