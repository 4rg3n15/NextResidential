import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import type { ResultadoDeSondeo } from '../src/equipos';
import { RepositorioDeEquiposEnMemoria } from '../src/equipos/infraestructura/repositorio-equipos-en-memoria';
import { SondaPorProveedor } from '../src/equipos/infraestructura/sonda-por-proveedor';
import { equiposSimulados } from '@ncr/providers';

/**
 * A · APROVISIONAMIENTO DE EQUIPOS DESDE LA CONSOLA
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA SUITE TIENE QUE DEMOSTRAR, Y LO QUE NO PUEDE
 *
 * **No puede** demostrar nada sobre un equipo real: el entorno de ejecución
 * deniega por diseño todo destino de rango privado, y ADR-03 exige además que
 * el sistema entero funcione sin hardware. Lo que sí demuestra —y es lo que
 * importa aquí— es que la sonda distingue **cuatro** situaciones y no una, y
 * que el secreto no vuelve por ninguna respuesta.
 *
 * El `fetch` se inyecta. Un doble de `fetch` no es una simulación del equipo:
 * es la respuesta EXACTA que el equipo daría en cada uno de los cuatro casos,
 * escrita a mano a partir de la documentación del fabricante.
 */
let app: INestApplication;

const conEquipos = async (sonda: {
  probar: (d: unknown) => Promise<ResultadoDeSondeo>;
}): Promise<{ app: INestApplication; repo: RepositorioDeEquiposEnMemoria; firmante: Firmante }> => {
  const firmante = await crearFirmante();
  const repo = new RepositorioDeEquiposEnMemoria();
  const creada = await crearApp(firmante, undefined, undefined, { repositorio: repo, sonda });
  app = creada;
  return { app: creada, repo, firmante };
};

afterEach(async () => {
  await app?.close();
});

const ALTA = {
  nombre: 'Cámara de la entrada',
  tipo: 'camara_lpr' as const,
  host: '203.0.113.10',
  puerto: 80,
  protocolo: 'http' as const,
  usuario: 'servicio_ncr',
  secreto: 'una-clave-que-no-debe-volver',
};

const ALCANZADO: ResultadoDeSondeo = {
  clase: 'alcanzado',
  detalle: 'El equipo responde y acepta la credencial: DS-TCG405-E',
  modelo: 'DS-TCG405-E',
  firmware: 'V5.7.3',
  latenciaMs: 41,
  verificado: true,
};

describe('A.2 · el secreto es de ESCRITURA: entra y no vuelve', () => {
  it('ninguna respuesta del alta lleva el secreto, ni enmascarado', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const res = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);

    expect(res.status).toBe(201);
    // Ni el campo, ni el valor, ni un enmascarado en ninguna parte del cuerpo.
    expect(res.body).not.toHaveProperty('secreto');
    expect(JSON.stringify(res.body)).not.toContain(ALTA.secreto);
    expect(JSON.stringify(res.body)).not.toContain('•');
  });

  it('tampoco al listarlos', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);
    const res = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(ALTA.secreto);
  });

  it('lo que se guarda es el SOBRE, no el texto', async () => {
    const { app: a, repo, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const res = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);
    const sobre = repo.sobreDe(COP_B, res.body.id as string);
    expect(sobre).toBeDefined();
    expect(sobre?.toString('utf8')).not.toContain(ALTA.secreto);
    // 12 de IV + 16 de etiqueta + el cuerpo: es el sobre AES-GCM, no un blob
    // cualquiera. Si alguien lo sustituyera por base64 del claro, esto lo dice.
    expect(sobre!.length).toBeGreaterThan(28);
  });

  it('editar SIN «secreto» no borra la clave: significa «no lo cambies»', async () => {
    const { app: a, repo, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);
    const antes = repo.sobreDe(COP_B, creado.body.id as string);

    // Se arma sin el campo en vez de desestructurar y descartar: lo que la
    // consola envía al editar es EXACTAMENTE esto, un cuerpo sin «secreto».
    const sinSecreto = { ...ALTA, secreto: undefined };
    const res = await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...sinSecreto, nombre: 'Cámara renombrada' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Cámara renombrada');
    expect(repo.sobreDe(COP_B, creado.body.id as string)).toEqual(antes);
  });

  it('cada alta y cada cambio dejan rastro', async () => {
    const { app: a, repo, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);
    await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/${creado.body.id}/baja`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'se retiró para mantenimiento' });
    expect(repo.auditoria.map((x) => x.recurso)).toEqual(['equipos/alta', 'equipos/baja']);
  });
});

describe('A.2 · quién puede, rol a rol', () => {
  it('el portero no entra ni a mirar', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_B });
    const res = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('el operador de central tampoco', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: null,
      copropiedades: [COP_B],
    });
    const res = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A.3 · LOS CUATRO RESULTADOS, CON LA RESPUESTA EXACTA DEL EQUIPO
 *
 * Aquí la sonda NO se sustituye: se ejercita `SondaPorProveedor` de verdad, con un
 * `fetch` que devuelve lo que devolvería el aparato. Sustituir la sonda habría
 * probado el controlador y dejado sin probar justo lo que esta parte añade.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CÁMARA LA PONE EL PAQUETE DE PROVEEDORES, NO ESTE FICHERO · 15-C
 *
 * La primera versión escribía aquí el XML de cada documento del equipo, y
 * KPI-11 la marcó **con razón**: el nombre de un elemento del fabricante es
 * vocabulario del fabricante aunque esté en una prueba. Un banco que conoce el
 * protocolo es un banco que hay que tocar cuando el protocolo cambia — que es
 * exactamente lo que la frontera existe para evitar.
 *
 * Ahora el equipo simulado lo sirve `@ncr/providers`, con los documentos
 * literales de la guía, y aquí sólo se dice **qué equipo** hay al otro lado:
 * uno conforme, uno que decide por su cuenta, uno que no reconoce matrículas.
 * Esta prueba no sabe cómo se escribe ninguna de esas tres cosas.
 */
const CAMARA = { familia: 'camara', usuario: ALTA.usuario, clave: ALTA.secreto } as const;

const camara = (guion: Record<string, unknown> = {}): typeof fetch =>
  equiposSimulados({ [ALTA.host]: { ...CAMARA, ...guion } });

describe('A.3 · «probar conexión» distingue cuatro situaciones, no una', () => {
  const sondaCon = (peticion: typeof fetch): SondaPorProveedor => new SondaPorProveedor(peticion);

  it('alcanzado: guarda modelo y firmware del propio equipo', async () => {
    const r = await sondaCon(camara({ modelo: 'MODELO-DE-PRUEBA', firmware: 'V9.9.9' })).probar({
      ...ALTA,
      tipo: 'camara_lpr',
    });

    expect(r.clase).toBe('alcanzado');
    expect(r.verificado).toBe(true);
    expect(r.modelo).toBe('MODELO-DE-PRUEBA');
    expect(r.firmware).toBe('V9.9.9');
  });

  it('y trae la FICHA: qué se leyó, qué debería decir y si hay botón', async () => {
    // Los cuatro desenlaces dicen si se puede operar; la ficha dice qué hay que
    // cambiar. Sin ella, «la cámara decide por su cuenta» manda a recorrer la
    // interfaz del aparato buscando cuál de tres cosas es.
    const r = await sondaCon(camara()).probar({ ...ALTA, tipo: 'camara_lpr' });
    expect(r.ficha?.hallazgos.length).toBeGreaterThan(0);
    expect(r.ficha?.hallazgos.some((h) => /quién decide/.test(h.campo))).toBe(true);
  });

  it('decide por su cuenta: contesta, autentica, y el modo ≠ 1 → NO VERIFICADO', async () => {
    // Es el hallazgo de bloqueo de C.1 llevado al alta. Con la cámara
    // decidiendo, el motor de reglas queda decorativo y se pierde la traza.
    const r = await sondaCon(camara({ ctrlMod: '0', modelo: 'MODELO-DE-PRUEBA' })).probar({
      ...ALTA,
      tipo: 'camara_lpr',
    });

    expect(r.clase).toBe('decide_solo');
    expect(r.verificado).toBe(false);
    // Y el modelo SÍ se conoce: el equipo contestó. Perder ese dato obligaría a
    // teclearlo a mano justo cuando el operador ya tiene un problema.
    expect(r.modelo).toBe('MODELO-DE-PRUEBA');
  });

  it('LA SEGUNDA VÍA · la lista blanca del equipo abre sola y eso bloquea', async () => {
    // El modo de control está BIEN. Lo que decide es la política interna: la
    // cámara lleva su propio motor de reglas y abre para su lista blanca.
    const r = await sondaCon(camara({ operacionDeListaBlanca: 'on' })).probar({
      ...ALTA,
      tipo: 'camara_lpr',
    });
    expect(r.clase).toBe('decide_solo');
    expect(r.detalle).toMatch(/lista blanca/i);
  });

  it('LA TERCERA VÍA · un disparador vinculado acciona una salida y eso bloquea', async () => {
    // Modo correcto y políticas correctas, y aun así el brazo sube al detectar
    // un vehículo: la acción vinculada acciona el relé directamente.
    const r = await sondaCon(camara({ disparadorAccionaPuerto: '1' })).probar({
      ...ALTA,
      tipo: 'camara_lpr',
    });
    expect(r.clase).toBe('decide_solo');
    expect(r.detalle).toMatch(/salida/i);
  });

  it('un equipo que NO declara reconocer matrículas no se da por bueno', async () => {
    // El fabricante lo dice con esas palabras: si ninguna de las cuatro
    // consultas de capacidad lo confirma, no se sigue adelante. Este modelo no
    // es una cámara de placa, y aceptarlo dejaría un punto de acceso mudo.
    const r = await sondaCon(camara({ declaraReconocimiento: false })).probar({
      ...ALTA,
      tipo: 'camara_lpr',
    });
    expect(r.clase).toBe('decide_solo');
    expect(r.detalle).toMatch(/matrícula/i);
  });

  it('credencial rechazada: lo dice, y AVISA de que no se reintente', async () => {
    // Con una clave distinta de la del equipo, el simulado contesta con su
    // desafío y nunca acepta: es exactamente lo que hace el aparato.
    const r = await sondaCon(
      equiposSimulados({ [ALTA.host]: { ...CAMARA, clave: 'otra-clave-distinta' } }),
    ).probar({ ...ALTA, tipo: 'camara_lpr' });
    expect(r.clase).toBe('credencial');
    expect(r.detalle).toMatch(/bloquean la cuenta/);
    expect(r.verificado).toBe(false);
  });

  it('inalcanzable: nombra host y puerto, y NUNCA el secreto', async () => {
    const r = await new SondaPorProveedor((() =>
      Promise.reject(new Error('connect ECONNREFUSED'))) as typeof fetch).probar({
      ...ALTA,
      tipo: 'camara_lpr',
    });
    expect(r.clase).toBe('inalcanzable');
    expect(r.detalle).toContain('203.0.113.10:80');
    expect(r.detalle).not.toContain(ALTA.secreto);
    expect(r.verificado).toBe(false);
  });

  it('una terminal facial NO se juzga por el modo de barrera: no manda ninguna', async () => {
    const r = await sondaCon(
      equiposSimulados({ [ALTA.host]: { ...CAMARA, familia: 'terminal' } }),
    ).probar({ ...ALTA, tipo: 'terminal_facial' });
    expect(r.clase).toBe('alcanzado');
  });
});

describe('A.3 · guardar un equipo que no contesta es legítimo, pero se marca', () => {
  it('queda NO VERIFICADO y con el motivo exacto a la vista', async () => {
    const noContesta: ResultadoDeSondeo = {
      clase: 'inalcanzable',
      detalle: 'No hay respuesta de 203.0.113.10:80 por HTTP.',
      modelo: null,
      firmware: null,
      latenciaMs: null,
      verificado: false,
    };
    const { app: a, firmante } = await conEquipos({ probar: async () => noContesta });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const res = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);

    expect(res.status).toBe(201);
    expect(res.body.verificacion).toBe('no_verificado');
    expect(res.body.motivoNoVerificado).toContain('203.0.113.10:80');
    expect(res.body.verificadoEn).toBeNull();
  });

  it('probar sin volver a escribir la clave no inventa un rechazo', async () => {
    // Un «credencial rechazada» falso invita a reintentar, y reintentar es lo
    // que bloquea la cuenta en el equipo. Aquí se dice la verdad: no se probó.
    const { app: a, firmante } = await conEquipos({
      probar: async () => {
        throw new Error('la sonda NO debería llamarse sin secreto');
      },
    });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, probarConexion: false });
    expect(creado.status).toBe(201);

    // Se arma sin el campo en vez de desestructurar y descartar: lo que la
    // consola envía al editar es EXACTAMENTE esto, un cuerpo sin «secreto».
    const sinSecreto = { ...ALTA, secreto: undefined };
    const res = await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(sinSecreto);

    expect(res.status).toBe(200);
    expect(res.body.verificacion).toBe('no_verificado');
    expect(res.body.motivoNoVerificado).toMatch(/no la muestra ni la reenvía/);
  });
});
