import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import type { ResultadoDeSondeo } from '../src/equipos';
import { RepositorioDeEquiposEnMemoria } from '../src/equipos/infraestructura/repositorio-equipos-en-memoria';
import { SondaPorProveedor } from '../src/equipos/infraestructura/sonda-por-proveedor';
import { OLVIDO_DE_EQUIPO } from '../src/equipos/aplicacion/puertos';
import { LECTOR_DE_SENALES } from '../src/equipos/aplicacion/senal-de-eventos';
import { capacidadesDescubiertas, equiposSimulados } from '@ncr/providers';
import { ALERTAS_DE_EQUIPO } from '../src/eventos';
import { REENVIO_DE_PLANTILLAS_A_EQUIPO } from '../src/equipos';
import type { ReenvioDePlantillasAEquipo } from '../src/equipos';
import type { AlertasDeEquipo } from '../src/eventos';

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

describe('O2 · las capacidades DESCUBIERTAS al sondear se persisten y se enseñan', () => {
  it('lo que la sonda descubre vuelve en el alta y en el listado, con su origen', async () => {
    const capacidades = capacidadesDescubiertas({
      aperturaRemota: 'si',
      senalizacionDeLlamada: 'no',
      audioBidireccional: { estado: 'si', canal: 1, formato: 'g711u' },
    });
    const { app: a, firmante } = await conEquipos({
      probar: async () => ({ ...ALCANZADO, capacidades }),
    });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const res = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, tipo: 'intercom', fabricante: 'Una marca', canalDeAudioHabilitado: true });

    expect(res.status).toBe(201);
    expect(res.body.capacidades.origen).toBe('descubiertas');
    expect(res.body.capacidades.aperturaRemota).toBe('si');
    expect(res.body.capacidades.senalizacionDeLlamada).toBe('no');
    // Lo no descubierto se enseña como DESCONOCIDA, nunca como sí.
    expect(res.body.capacidades.bibliotecaDeRostros.estado).toBe('desconocida');
    expect(res.body.fabricante).toBe('Una marca');
    expect(res.body.canalDeAudioHabilitado).toBe(true);

    const lista = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`);
    expect(lista.body.equipos[0].capacidades.audioBidireccional.canal).toBe(1);
  });

  it('sin sondeo no hay capacidades: `null`, no un objeto de síes', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const res = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, probarConexion: false });
    expect(res.status).toBe(201);
    expect(res.body.capacidades).toBeNull();
  });
});

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

describe('R1 (15-N) · el equipo que PASA a recibir plantillas recibe las que le faltan', () => {
  const conRostros = capacidadesDescubiertas({
    bibliotecaDeRostros: { estado: 'si', maximo: 500, almacenadas: 0 },
  });
  const sinSaber = capacidadesDescubiertas({});

  it('en el alta con biblioteca: se encola el reenvío de ESE equipo', async () => {
    const { app: a, firmante } = await conEquipos({
      probar: async () => ({ ...ALCANZADO, capacidades: conRostros }),
    });
    const espia = vi.spyOn(
      a.get<ReenvioDePlantillasAEquipo>(REENVIO_DE_PLANTILLAS_A_EQUIPO, { strict: false }),
      'encolar',
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, tipo: 'intercom' });
    expect(creado.status).toBe(201);
    expect(espia).toHaveBeenCalledWith(COP_B, creado.body.id);
  });

  it('de «no se sabe» a «sí» al editar: se encola; si ya recibía, no', async () => {
    let capacidades = sinSaber;
    const { app: a, firmante } = await conEquipos({
      probar: async () => ({ ...ALCANZADO, capacidades }),
    });
    const espia = vi.spyOn(
      a.get<ReenvioDePlantillasAEquipo>(REENVIO_DE_PLANTILLAS_A_EQUIPO, { strict: false }),
      'encolar',
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, tipo: 'intercom' });
    expect(espia).not.toHaveBeenCalled();

    capacidades = conRostros;
    const editar = () =>
      request(a.getHttpServer())
        .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...ALTA, tipo: 'intercom', nombre: 'Videoportero torre B' });
    expect((await editar()).status).toBe(200);
    expect(espia).toHaveBeenCalledTimes(1);
    await editar();
    expect(espia).toHaveBeenCalledTimes(1);
  });
});

describe('A1 (15-N) · la baja archiva las alertas abiertas del equipo', () => {
  it('una alerta abierta del equipo sale de la lista y del contador al darlo de baja', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);
    const id = creado.body.id as string;
    await a.get<AlertasDeEquipo>(ALERTAS_DE_EQUIPO).ejecutar(
      {
        copropiedadId: COP_B,
        dispositivoId: id,
        tipo: 'dispositivo_caido',
        severidad: 'alta',
        clave: 'caido',
        notas: 'sin latido',
        persistente: true,
      },
      'prueba',
    );
    const lista = () =>
      request(a.getHttpServer())
        .get(`/copropiedades/${COP_B}/alertas`)
        .query({ dispositivoId: id })
        .set('Authorization', `Bearer ${token}`);
    expect((await lista()).body).toHaveLength(1);
    await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/${id}/baja`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'equipo reemplazado' })
      .expect(201);
    expect((await lista()).body).toEqual([]);
    const tablero = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/tablero/indicadores`)
      .set('Authorization', `Bearer ${token}`);
    expect(tablero.status).toBe(200);
    expect(tablero.body.alertas.pendientes).toBe(0);
  });
});

describe('A2 (15-N) · la lista de alertas se filtra por fecha', () => {
  it('desde incluido, hasta excluido; una fecha que no es fecha es 400', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    await a.get<AlertasDeEquipo>(ALERTAS_DE_EQUIPO).ejecutar(
      {
        copropiedadId: COP_B,
        dispositivoId: '20000000-0000-4000-8000-000000000001',
        tipo: 'acceso_dudoso',
        severidad: 'media',
        clave: 'fecha',
        notas: 'para filtrar',
        persistente: false,
      },
      'prueba',
    );
    const pedir = (query: Record<string, string>) =>
      request(a.getHttpServer())
        .get(`/copropiedades/${COP_B}/alertas`)
        .query(query)
        .set('Authorization', `Bearer ${token}`);
    const ayer = new Date(Date.now() - 86_400_000).toISOString();
    const manana = new Date(Date.now() + 86_400_000).toISOString();
    expect((await pedir({ desde: ayer, hasta: manana })).body).toHaveLength(1);
    expect((await pedir({ desde: manana })).body).toEqual([]);
    expect((await pedir({ hasta: ayer })).body).toEqual([]);
    expect((await pedir({ desde: 'ayer' })).status).toBe(400);
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

  it('H-SITIO-01 · la cámara que decide sola queda RECHAZADA, con su EntranceParam a la vista', async () => {
    const { app: a, firmante } = await conEquipos(sondaCon(camara({ ctrlMod: '0' })));
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const prueba = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/prueba-de-conexion`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA)
      .expect(201);
    const crudos = prueba.body.ficha.crudos as { titulo: string; contenido: string }[];
    expect(crudos.map((c) => c.titulo)).toContain('Parámetros de entrada (EntranceParam)');
    // Saneado: ni la clave ni la dirección del equipo salen hacia el navegador.
    expect(JSON.stringify(crudos)).not.toContain(ALTA.secreto);
    expect(JSON.stringify(crudos)).not.toContain(ALTA.host);

    const alta = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA)
      .expect(201);
    expect(alta.body.verificacion).toBe('rechazado');
  });

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

  it('inalcanzable: nombra el host ELIDIDO y el puerto, y NUNCA el secreto (§7.1)', async () => {
    const r = await new SondaPorProveedor((() =>
      Promise.reject(new Error('connect ECONNREFUSED'))) as typeof fetch).probar({
      ...ALTA,
      tipo: 'camara_lpr',
    });
    expect(r.clase).toBe('inalcanzable');
    // Lo justo para reconocerla; la dirección completa no forma parte del contrato.
    expect(r.detalle).toContain('20…10:80');
    expect(r.detalle).not.toContain('203.0.113.10');
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
    // O4 · SIN clave guardada: el alta no la trae. Con una guardada, editar sí
    // sondea —con la del servidor—, y eso lo prueba la sección O4 de abajo.
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, secreto: undefined, probarConexion: false });
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
    expect(res.body.motivoNoVerificado).toMatch(/no tiene clave guardada/);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O4 · TERMINAL Y VIDEOPORTERO AL NIVEL DE LA CÁMARA
 *
 * Sonda REAL contra el simulador de `@ncr/providers`: lo que se prueba es que
 * la ficha de una terminal es la de una terminal, que «decide sola» se juzga
 * como en la cámara —salvo declaración expresa—, y que un equipo ya dado de
 * alta se vuelve a sondear con la clave GUARDADA, sin que nadie la reescriba.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('O4 · la ficha es por tipo y el sondeo posterior usa la clave guardada', () => {
  const TERMINAL = { ...ALTA, nombre: 'Terminal del gimnasio', tipo: 'terminal_facial' as const };
  const VIDEOPORTERO = { ...ALTA, nombre: 'Portero principal', tipo: 'intercom' as const };
  const sondaCon = (familia: 'terminal' | 'videoportero', guion: Record<string, unknown>) =>
    new SondaPorProveedor(
      equiposSimulados({
        [ALTA.host]: { familia, usuario: ALTA.usuario, clave: ALTA.secreto, ...guion },
      }),
    );

  it('una terminal que espera el veredicto queda VERIFICADA, con su ficha y sin la de cámara', async () => {
    const { app: a, firmante } = await conEquipos(
      sondaCon('terminal', { verificacionRemota: true }),
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const prueba = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/prueba-de-conexion`)
      .set('Authorization', `Bearer ${token}`)
      .send(TERMINAL)
      .expect(201);
    const campos = (prueba.body.ficha.hallazgos as { campo: string; estado: string }[]).map(
      (h) => h.campo,
    );
    expect(campos).toContain('quién decide la apertura');
    expect(campos).toContain('Rostros');
    expect(campos.some((c) => /país|disparador/.test(c))).toBe(false);
    // E4 (15-M) · el receptor SÍ sale en la terminal: un «HTTP listening»
    // escrito en ella es un resto huérfano que la ficha tiene que enseñar.
    expect(campos).toContain('receptor de eventos (servidor de alarmas)');
    expect(prueba.body.verificado).toBe(true);
    expect(prueba.body.capacidades.verificacionRemota).toBe('si');
  });

  it('una terminal que decide sola NO se da por buena… salvo que se declare a sabiendas', async () => {
    const { app: a, firmante } = await conEquipos(
      sondaCon('terminal', { verificacionRemota: false }),
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const sola = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(TERMINAL)
      .expect(201);
    expect(sola.body.verificacion).toBe('rechazado');
    expect(sola.body.motivoNoVerificado).toMatch(/decide por su cuenta/);

    const declarada = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...TERMINAL, nombre: 'Terminal declarada', modoDeTerminal: 'decide_el_equipo' })
      .expect(201);
    expect(declarada.body.verificacion).toBe('verificado');
    expect(declarada.body.modoDeTerminal).toBe('decide_el_equipo');
  });

  it('el videoportero trae apertura, audio, llamada y suscripción; sin audio es aviso, no bloqueo', async () => {
    const { app: a, firmante } = await conEquipos(
      sondaCon('videoportero', {
        aperturaRemota: true,
        canalesDeAudio: [{ id: 1, habilitado: false }],
      }),
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const prueba = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/prueba-de-conexion`)
      .set('Authorization', `Bearer ${token}`)
      .send(VIDEOPORTERO)
      .expect(201);
    const hallazgos = prueba.body.ficha.hallazgos as { campo: string; estado: string }[];
    expect(hallazgos.find((h) => /apertura desde la plataforma/.test(h.campo))?.estado).toBe(
      'conforme',
    );
    expect(hallazgos.find((h) => /canal de audio/.test(h.campo))?.estado).toBe('aviso');
    expect(prueba.body.verificado).toBe(true);
    expect(prueba.body.capacidades.audioBidireccional.estado).toBe('no');
  });

  it('POST …/diagnostico sondea con la clave GUARDADA, persiste y deja rastro', async () => {
    const {
      app: a,
      repo,
      firmante,
    } = await conEquipos(
      sondaCon('terminal', {
        verificacionRemota: true,
        bibliotecaMaximo: 100,
        bibliotecaAlmacenadas: 95,
      }),
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    // Alta SIN sondear: queda no verificada y sin capacidades.
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...TERMINAL, probarConexion: false })
      .expect(201);
    expect(creado.body.verificacion).toBe('no_verificado');
    expect(creado.body.capacidades).toBeNull();

    const diagnostico = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/${creado.body.id}/diagnostico`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(diagnostico.body.verificado).toBe(true);
    const biblioteca = (
      diagnostico.body.ficha.hallazgos as { campo: string; estado: string }[]
    ).find((h) => h.campo === 'Rostros');
    expect(biblioteca?.estado).toBe('aviso');
    // Y nada de la respuesta lleva la clave.
    expect(JSON.stringify(diagnostico.body)).not.toContain(ALTA.secreto);

    const lista = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const guardado = (
      lista.body.equipos as {
        id: string;
        verificacion: string;
        capacidades: { verificacionRemota: string } | null;
      }[]
    ).find((e) => e.id === creado.body.id);
    expect(guardado?.verificacion).toBe('verificado');
    expect(guardado?.capacidades?.verificacionRemota).toBe('si');
    expect(repo.auditoria.map((x) => x.recurso)).toContain('equipos/diagnostico');
  });

  it('sin clave guardada, el diagnóstico lo dice (404) y no inventa un sondeo', async () => {
    const { app: a, firmante } = await conEquipos(sondaCon('terminal', {}));
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...TERMINAL, secreto: undefined, probarConexion: false })
      .expect(201);
    const r = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/${creado.body.id}/diagnostico`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(JSON.stringify(r.body)).toMatch(/credencial guardada/);
  });

  it('editar SIN reescribir la clave vuelve a sondear con la guardada: queda verificado', async () => {
    const { app: a, firmante } = await conEquipos(
      sondaCon('terminal', { verificacionRemota: true }),
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...TERMINAL, probarConexion: false })
      .expect(201);
    expect(creado.body.verificacion).toBe('no_verificado');

    const editado = await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...TERMINAL, secreto: undefined, nombre: 'Terminal renombrada' })
      .expect(200);
    expect(editado.body.nombre).toBe('Terminal renombrada');
    expect(editado.body.verificacion).toBe('verificado');
    expect(editado.body.capacidades?.verificacionRemota).toBe('si');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O5 · §7.1 · EL CLIENTE NUNCA CONOCE LA RED DEL CONJUNTO
 *
 * Hasta la 15-C la dirección, el puerto y el usuario del equipo volvían en el
 * alta y en el listado (C-11 los consideraba inventario). C-28 lo revoca: con
 * el equipo habla el servidor, y lo que no cruza no se puede filtrar. La
 * edición pasa a ser PARCIAL: lo que no viene se conserva de lo guardado.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('O5 · ninguna respuesta lleva dirección, puerto, protocolo ni usuario del equipo', () => {
  it('ni el alta ni el listado ni la ficha: los campos NO EXISTEN en la respuesta', async () => {
    const { app: a, firmante } = await conEquipos({ probar: async () => ALCANZADO });
    const token = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA)
      .expect(201);
    for (const campo of ['host', 'puerto', 'protocolo', 'usuario', 'secreto']) {
      expect(creado.body).not.toHaveProperty(campo);
    }
    const lista = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const cuerpo = JSON.stringify(lista.body);
    expect(cuerpo).not.toContain(ALTA.host);
    expect(cuerpo).not.toContain(ALTA.usuario);
    expect(cuerpo).not.toContain(ALTA.secreto);
  });

  it('editar es PARCIAL: sólo el nombre viaja y la dirección guardada sigue sirviendo para sondear', async () => {
    const sondeos: { host: string; usuario: string }[] = [];
    const {
      app: a,
      repo,
      firmante,
    } = await conEquipos({
      probar: async (d) => {
        sondeos.push(d as { host: string; usuario: string });
        return ALCANZADO;
      },
    });
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, canalBarrera: 2 })
      .expect(201);
    const antes = repo.sobreDe(COP_B, creado.body.id as string);

    const editado = await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Cámara renombrada' })
      .expect(200);
    expect(editado.body.nombre).toBe('Cámara renombrada');
    expect(editado.body.canalBarrera).toBe(2);
    expect(editado.body.verificacion).toBe('verificado');
    // El sondeo de la edición usó la dirección y el usuario GUARDADOS, que el
    // cliente nunca vio, y el sobre del secreto no se tocó.
    expect(sondeos.at(-1)).toMatchObject({ host: ALTA.host, usuario: ALTA.usuario });
    expect(repo.sobreDe(COP_B, creado.body.id as string)).toEqual(antes);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-11 · LA ATESTACIÓN DEL INSTALADOR
 *
 * Sólo el superadministrador; sólo una cámara; sólo con firmware conocido. La
 * fila del equipo la trae con su vigencia, y un firmware nuevo la deja sin
 * efecto sin tocar la atestación (la tabla es de sólo inserción).
 * ═════════════════════════════════════════════════════════════════════════════
 */
describe('D-11 · atestación del instalador sobre una cámara', () => {
  const ENTRADA = {
    placaEnListaBlanca: 'abc-123',
    placaDesconocida: 'XYZ 987',
    ningunaAbrio: true,
    evidencia: 'Carril 1, 10:40: dos pasadas; el brazo no subió en ninguna de las dos.',
  };
  const RECHAZADA: ResultadoDeSondeo = {
    ...ALCANZADO,
    clase: 'decide_solo',
    verificado: false,
    firmware: 'V5.3.0',
    detalle: 'la cámara decide por su cuenta',
  };

  const montar = async (veredicto: ResultadoDeSondeo = RECHAZADA) => {
    const { app: a, firmante } = await conEquipos({ probar: async () => veredicto });
    const admin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const superadmin = await tokenDe(firmante, {
      rol: 'superadministrador',
      copropiedadId: COP_B,
    });
    const camara = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${admin}`)
      .send(ALTA)
      .expect(201);
    return { a, admin, superadmin, id: camara.body.id as string };
  };
  const atestar = (a: INestApplication, token: string, id: string, cuerpo: object = ENTRADA) =>
    request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/${id}/atestacion`)
      .set('Authorization', `Bearer ${token}`)
      .send(cuerpo);

  it('el administrador del conjunto NO atesta: 403 por rol', async () => {
    const { a, admin, id } = await montar();
    await atestar(a, admin, id).expect(403);
  });

  it('sin la declaración «ninguna abrió» no hay atestación: 400', async () => {
    const { a, superadmin, id } = await montar();
    await atestar(a, superadmin, id, { ...ENTRADA, ningunaAbrio: false }).expect(400);
  });

  it('la misma placa dos veces no prueba nada: 400', async () => {
    const { a, superadmin, id } = await montar();
    await atestar(a, superadmin, id, { ...ENTRADA, placaDesconocida: 'ABC123' }).expect(400);
  });

  it('el superadministrador atesta; la fila la trae VIGENTE, con placas normalizadas', async () => {
    const { a, admin, superadmin, id } = await montar();
    const r = await atestar(a, superadmin, id).expect(201);
    expect(r.body).toMatchObject({
      firmware: 'V5.3.0',
      placaEnListaBlanca: 'ABC123',
      placaDesconocida: 'XYZ987',
      vigente: true,
      motivoSinEfecto: null,
    });
    const lista = await request(a.getHttpServer())
      .get(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const fila = (
      lista.body.equipos as { id: string; verificacion: string; atestacion: unknown }[]
    ).find((e) => e.id === id);
    // La atestación NO vuelve verde a la cámara: sigue rechazada por la API.
    expect(fila?.verificacion).toBe('rechazado');
    expect(fila?.atestacion).toMatchObject({ vigente: true, firmware: 'V5.3.0' });
  });

  it('otro firmware tras un sondeo nuevo: la atestación queda SIN EFECTO y lo dice', async () => {
    let firmware = 'V5.3.0';
    const { app: a, firmante } = await conEquipos({
      probar: async () => ({ ...RECHAZADA, firmware }),
    });
    const admin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const superadmin = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: COP_B });
    const alta = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${admin}`)
      .send(ALTA)
      .expect(201);
    await atestar(a, superadmin, alta.body.id as string).expect(201);

    firmware = 'V5.3.2';
    const editado = await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${alta.body.id as string}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: 'Cámara de la entrada' })
      .expect(200);
    expect(editado.body.atestacion).toMatchObject({ vigente: false });
    expect(editado.body.atestacion.motivoSinEfecto).toMatch(/V5\.3\.0.*V5\.3\.2/);
  });

  it('un equipo que no es cámara no se atesta', async () => {
    const { a, admin, superadmin } = await montar({ ...ALCANZADO, firmware: 'V1' });
    const terminal = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...ALTA, nombre: 'Terminal', tipo: 'terminal_facial' })
      .expect(201);
    await atestar(a, superadmin, terminal.body.id as string).expect(400);
  });
});

describe('C1 (15-L) · editar, dar de baja y reactivar hacen OLVIDAR al proceso lo que recordaba', () => {
  it('cada cambio pide olvidar ESE equipo; el alta no (no había nada que olvidar)', async () => {
    const olvidados: string[] = [];
    const firmante = await crearFirmante();
    const repo = new RepositorioDeEquiposEnMemoria();
    app = await crearApp(
      firmante,
      (m) =>
        m
          .overrideProvider(OLVIDO_DE_EQUIPO)
          .useValue({ olvidar: (id: string) => void olvidados.push(id) }),
      undefined,
      { repositorio: repo, sonda: { probar: async () => ALCANZADO } },
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const http = () => request(app.getHttpServer());
    const creado = await http()
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send(ALTA);
    const id = creado.body.id as string;
    expect(olvidados).toEqual([]);

    await http()
      .put(`/copropiedades/${COP_B}/equipos/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ host: '203.0.113.11' })
      .expect(200);
    await http()
      .post(`/copropiedades/${COP_B}/equipos/${id}/baja`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'se retiró para mantenimiento' })
      .expect(201);
    await http()
      .post(`/copropiedades/${COP_B}/equipos/${id}/reactivacion`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(olvidados).toEqual([id, id, id]);
  });
});

describe('C3 (15-L) · «Probar conexión» de un videoportero dice cómo van sus eventos', () => {
  it('la ficha trae «eventos del equipo» con la señal real de su escucha', async () => {
    const firmante = await crearFirmante();
    const repo = new RepositorioDeEquiposEnMemoria();
    const CON_FICHA: ResultadoDeSondeo = {
      ...ALCANZADO,
      ficha: {
        modelo: 'VIDEOPORTERO-SIM',
        firmware: 'V1',
        serie: null,
        horaDelEquipo: null,
        desvioDeRelojSegundos: null,
        hallazgos: [],
        sinComprobar: [],
      },
    };
    app = await crearApp(
      firmante,
      (m) =>
        m.overrideProvider(LECTOR_DE_SENALES).useValue({
          senal: () => ({ transporte: 'escucha', ultimaSenal: new Date(Date.now() - 4000) }),
        }),
      undefined,
      { repositorio: repo, sonda: { probar: async () => CON_FICHA } },
    );
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, tipo: 'intercom', nombre: 'Videoportero de la entrada' });
    const r = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos/${creado.body.id as string}/diagnostico`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(201);
    const eventos = (
      r.body.ficha.hallazgos as { campo: string; estado: string; valorLeido: string }[]
    ).find((h) => h.campo === 'eventos del equipo');
    expect(eventos).toMatchObject({ estado: 'conforme' });
    expect(eventos?.valorLeido).toMatch(/flujo de alertas · última señal hace \d+ s/);
  });
});

/**
 * O2 (15-N) · DT-15M-04 · «Sin zona» QUITA la zona
 *
 * La edición es parcial: lo ausente se conserva (O5). Por eso «sin zona» no
 * podía ser «ausente»: se leía «sin cambio» y la zona se quedaba. Ahora
 * `zonaId: null` es «quítala», y ausente sigue siendo «no la toques».
 */
describe('O2 (15-N) · DT-15M-04 · «Sin zona» quita la zona de un equipo', () => {
  const ZONA = '30000000-0000-4000-8000-0000000000a1';
  const alcanza = { probar: async () => ALCANZADO };

  it('zonaId null la quita; ausente la conserva', async () => {
    const { app: a, firmante } = await conEquipos(alcanza);
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, zonaId: ZONA, probarConexion: false })
      .expect(201);
    expect(creado.body.zonaId).toBe(ZONA);

    const sinTocar = await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Renombrado', probarConexion: false })
      .expect(200);
    expect(sinTocar.body.zonaId).toBe(ZONA);

    const sinZona = await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaId: null, probarConexion: false })
      .expect(200);
    expect(sinZona.body.zonaId).toBeNull();
  });

  it('un zonaId que no es UUID se sigue rechazando', async () => {
    const { app: a, firmante } = await conEquipos(alcanza);
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const creado = await request(a.getHttpServer())
      .post(`/copropiedades/${COP_B}/equipos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...ALTA, probarConexion: false })
      .expect(201);
    await request(a.getHttpServer())
      .put(`/copropiedades/${COP_B}/equipos/${creado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaId: 'sin-zona', probarConexion: false })
      .expect(400);
  });
});
