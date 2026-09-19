import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  COP_A,
  COP_B,
  crearApp,
  crearFirmante,
  rutasConRol,
  rutasConMetadato,
  tokenDe,
} from './utilidades';
import type { Firmante, RutaExpuesta } from './utilidades';
import { CLAVE_ALCANCE_DEL_LLAMANTE, CLAVE_SIN_RECURSO_TENANT } from '../src/comun/decoradores';
import {
  MARCAS_VIVIENDA_2,
  USUARIO_R1,
  VIVIENDA_1,
  VIVIENDA_2,
  registroDeEscrituras,
  USUARIO_R2,
  USUARIO_RB,
  USUARIO_SIN_VIVIENDA,
} from './dobles/directorio-del-residente';

/**
 * SUITE DE AISLAMIENTO · SEGUNDO EJE: RESIDENTE CONTRA RESIDENTE
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA UNA SEGUNDA SUITE
 *
 * `aislamiento.e2e.test.ts` recorre todos los endpoints con un token de OTRA
 * copropiedad y trata cualquier 2xx como fuga. Ese recorrido es completo para
 * los cinco roles que administran u operan, y **ciego** para el residente: su
 * token es legítimo para su copropiedad, así que pasa el primer eje sin
 * esfuerzo. Lo que el primer eje no puede ver es que dentro de un mismo
 * conjunto hay otra frontera —la vivienda— y que cruzarla filtra la vida
 * privada de un vecino: quién lo visita, con qué placa y a qué hora entra.
 *
 * Es tan grave como ver los datos de otro conjunto. La diferencia es sólo a
 * quién se le filtran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y POR QUÉ ROMPE EL BUILD, NO SÓLO COMPRUEBA
 *
 * La lista de rutas que un residente alcanza **se deriva del enrutador** con
 * `rutasConRol(app, 'residente')`, no se escribe aquí. Una ruta nueva marcada
 * `@Roles('residente')` sin su comprobación de vivienda deja de cuadrar con
 * `RECORRIDAS` y la suite se pone roja el día que se añade — que es el único
 * día en que el autor tiene el contexto para arreglarla.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LÍNEA BASE, que es lo que hace que esto no sea una comprobación vacía
 *
 * «El cuerpo de R1 no contiene los datos de R2» pasaría en verde si R2 no
 * tuviera datos, o si las respuestas vinieran vacías por un error. Por eso el
 * primer bloque exige lo contrario: que R2 SÍ vea sus marcas. Sin esa mitad,
 * esta suite sería la número diecinueve de la familia que persigue el
 * repositorio — el control que existe y no comprueba lo que crees.
 */
let app: INestApplication;
let firmante: Firmante;
let rutasDelResidente: RutaExpuesta[];

/**
 * Las rutas del residente que esta suite recorre, con lo que se le pide a cada
 * una. La clave es `MÉTODO /ruta` tal como la imprime el enrutador.
 */
const RECORRIDAS: Record<string, { readonly esperaLista: boolean }> = {
  'GET /copropiedades/:id/mi/vivienda': { esperaLista: false },
  'GET /copropiedades/:id/mi/familia': { esperaLista: true },
  'GET /copropiedades/:id/mi/vehiculos': { esperaLista: true },
  'GET /copropiedades/:id/mi/autorizaciones': { esperaLista: true },
  'GET /copropiedades/:id/mi/historial': { esperaLista: true },
};

/**
 * Rutas alcanzables por el residente que NO acotan por vivienda, con el motivo
 * de cada una. **La lista salió del control, no de mi cabeza**: el `it`
 * estructural de abajo la derivó del enrutador y me obligó a justificar las
 * diez que no había previsto. Dos de ellas eran hallazgos.
 *
 * | Ruta                                          | Por qué no acota por vivienda                                           |
 * | --------------------------------------------- | ----------------------------------------------------------------------- |
 * | `/auth/sesion`, `/auth/mfa/*`, `/auth/restab…` | Operan sobre la propia identidad. Llevan `@SinRecursoDeTenant()` y el primer eje las comprueba una por una |
 * | `GET /copropiedades`, `GET /copropiedades/:id` | Devuelven el alcance del llamante. `@AlcanceDelLlamante()` con su comprobación dedicada en la otra suite |
 * | `GET /copropiedades/:id/zonas`                 | Las zonas son del CONJUNTO, no de una vivienda: el aforo de la piscina es el mismo para todos (RN-14) |
 * | `GET /copropiedades/:id/mi/zonas`              | Igual, y por eso cuelga de `/mi` solo por comodidad de la app: lo que cambia respecto de la ruta de administración es el ROL, no el ámbito (11-B, M-5) |
 * | `…/biometria/consentimientos/:id/respuesta`    | La barrera es más fuerte que la vivienda: el agregado exige que responda **el titular del dato** (RN-10), y lo verifica el dominio, no el controlador |
 * | `…/biometria/consentimientos/:id/revocacion`   | Igual: solo el titular revoca (RN-11). Cubierto en `biometria.e2e.test.ts` |
 * | `GET …/biometria/consentimientos/:id`          | **D-77, declarado y no resuelto.** Devuelve estado, finalidad y canal de cualquier consentimiento del conjunto a quien conozca su UUID. No expone dato biométrico y el identificador no es enumerable, pero un residente no debería poder leer el consentimiento del visitante de su vecino. Se acota por titular en 11-B |
 *
 * Y una que estaba y ya no está: `POST …/zonas/:zonaId/autorizaciones`
 * (**D-76**), donde un residente podía dar acceso a una zona a la autorización
 * de otra vivienda. Ver la comprobación dedicada más abajo.
 */
const SIN_AMBITO_DE_VIVIENDA = new Set([
  'GET /auth/sesion',
  'POST /auth/mfa/codigos',
  'POST /auth/mfa/recuperacion',
  'POST /auth/restablecimiento',
  'GET /copropiedades',
  'GET /copropiedades/:id',
  'GET /copropiedades/:id/zonas',
  'GET /copropiedades/:id/mi/zonas',
  'GET /copropiedades/:id/biometria/consentimientos/:consentimientoId',
  'POST /copropiedades/:id/biometria/consentimientos/:consentimientoId/respuesta',
  'POST /copropiedades/:id/biometria/consentimientos/:consentimientoId/revocacion',
]);

/**
 * Rutas que un residente NO debe alcanzar aunque parezca natural que sí, con el
 * defecto que lo demostró. Es el conjunto que impide que el arreglo se
 * revierta: devolver el rol a la ruta pone esto en rojo.
 */
const NEGADAS_AL_RESIDENTE: readonly { readonly clave: string; readonly motivo: string }[] = [
  {
    clave: 'POST /copropiedades/:id/zonas/:zonaId/autorizaciones',
    motivo:
      'D-76 · el permiso se da a un `autorizacionId` del cuerpo y solo se comprobaba la ' +
      'copropiedad: un residente podía dar acceso a la zona al visitante de su vecino',
  },
];

/**
 * ESCRITURAS del residente (11-B). No se recorren como las lecturas —crear algo
 * no «filtra» nada— sino con la pregunta que sí importa: **¿dónde cae lo que
 * crea?** La comprobación está más abajo: R1 crea y lo suyo aparece en SU
 * vivienda y no en la del vecino.
 *
 * Están aquí, y no en `SIN_AMBITO_DE_VIVIENDA`, porque sí tienen ámbito de
 * vivienda: lo que no tienen es forma de nombrarla.
 */
const ESCRITURAS_DEL_AMBITO: Record<string, { readonly cuerpo: Record<string, unknown> }> = {
  'POST /copropiedades/:id/mi/autorizaciones': {
    cuerpo: {
      visitante: 'Visitante de R1',
      desde: new Date(Date.now() + 60_000).toISOString(),
      hasta: new Date(Date.now() + 3_600_000).toISOString(),
      acompanantes: ['Acompañante de R1'],
      observaciones: 'creada por la suite de aislamiento',
      claveDeIdempotencia: 'clave-de-aislamiento-0001',
    },
  },
  'POST /copropiedades/:id/mi/notificaciones/aparatos': {
    cuerpo: {
      instalacionId: 'instalacion-de-r1',
      token: 'token-de-prueba-0001',
      plataforma: 'android',
    },
  },
};

/** Relleno con forma de UUID para los parámetros que no son la copropiedad. */
const OTRO_ID = '00000000-0000-4000-8000-0000000000ff';

const tokenResidente = (usuarioId: string, copropiedadId: string) =>
  tokenDe(firmante, { rol: 'residente', copropiedadId, usuarioId, aal: 'aal1' });

const pedir = (ruta: string, copropiedadId: string, token: string) =>
  request(app.getHttpServer())
    .get(ruta.replace(':id', copropiedadId))
    .set('Authorization', `Bearer ${token}`);

const enviar = (
  ruta: string,
  copropiedadId: string,
  token: string,
  cuerpo: Record<string, unknown>,
) =>
  request(app.getHttpServer())
    .post(ruta.replace(':id', copropiedadId))
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo);

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  rutasDelResidente = rutasConRol(app, 'residente');
});
afterAll(async () => {
  await app?.close();
});

describe('cobertura · la lista de rutas sale del CÓDIGO, no de esta prueba', () => {
  it('hay rutas del residente que recorrer', () => {
    expect(rutasDelResidente.length).toBeGreaterThan(0);
  });

  it('toda ruta con @Roles(residente) está recorrida o declarada sin ámbito de vivienda', () => {
    const sinCubrir = rutasDelResidente
      .map((r) => `${r.metodo} ${r.ruta}`)
      .filter(
        (clave) =>
          RECORRIDAS[clave] === undefined &&
          ESCRITURAS_DEL_AMBITO[clave] === undefined &&
          !SIN_AMBITO_DE_VIVIENDA.has(clave),
      );
    expect(
      sinCubrir,
      `rutas alcanzables por un residente SIN comprobación de vivienda: ${sinCubrir.join(', ')}. ` +
        'Añádela a RECORRIDAS con su comprobación, o a SIN_AMBITO_DE_VIVIENDA justificando por qué.',
    ).toEqual([]);
  });

  it('las declaradas sin ámbito de vivienda existen de verdad en el enrutador', () => {
    // El otro lado del control: un conjunto que envejece con rutas que ya no
    // existen deja de decir nada, y de paso esconde las que sí faltan.
    const existentes = new Set(rutasDelResidente.map((r) => `${r.metodo} ${r.ruta}`));
    const fantasmas = [...SIN_AMBITO_DE_VIVIENDA].filter((c) => !existentes.has(c));
    expect(fantasmas, `declaradas y ya inexistentes: ${fantasmas.join(', ')}`).toEqual([]);
  });

  it('las rutas recorridas existen y son alcanzables por el residente', () => {
    const existentes = new Set(rutasDelResidente.map((r) => `${r.metodo} ${r.ruta}`));
    for (const clave of Object.keys(RECORRIDAS)) {
      expect(existentes, `${clave} no la alcanza un residente`).toContain(clave);
    }
  });

  it('la superficie del residente NO está exenta del primer eje', () => {
    /**
     * El agujero que esto impide: marcar `/mi/...` como «sin recurso de
     * tenant» —parece razonable, «opera sobre el propio residente»— la sacaría
     * del recorrido de fuga entre copropiedades. Las dos marcas se leen del
     * código; ninguna ruta de `mi` puede llevarlas.
     */
    const exentas = [
      ...rutasConMetadato(app, CLAVE_SIN_RECURSO_TENANT),
      ...rutasConMetadato(app, CLAVE_ALCANCE_DEL_LLAMANTE),
    ];
    expect(exentas.filter((r) => r.includes('/mi'))).toEqual([]);
  });
});

describe('línea base · el vecino SÍ tiene datos (sin esto, lo de abajo es vacío)', () => {
  it('el residente de la vivienda 2 ve sus propias marcas', async () => {
    const token = await tokenResidente(USUARIO_R2, COP_A);
    const cuerpos: string[] = [];
    for (const ruta of Object.keys(RECORRIDAS)) {
      const res = await pedir(ruta.slice(4), COP_A, token);
      expect(res.status, `${ruta} → ${res.status}`).toBe(200);
      cuerpos.push(JSON.stringify(res.body));
    }
    const todo = cuerpos.join(' ');
    for (const marca of MARCAS_VIVIENDA_2) {
      expect(todo, `el doble no expone «${marca}»: el recorrido de fuga sería vacío`).toContain(
        marca,
      );
    }
  });
});

describe('eje 2 · un residente NO alcanza nada de la vivienda del vecino', () => {
  it('ninguna respuesta al residente 1 contiene un dato de la vivienda 2', async () => {
    const token = await tokenResidente(USUARIO_R1, COP_A);
    const fugas: string[] = [];
    for (const [clave, { esperaLista }] of Object.entries(RECORRIDAS)) {
      const res = await pedir(clave.slice(4), COP_A, token);
      if (res.status !== 200) {
        fugas.push(
          `${clave} → ${res.status} ${JSON.stringify(res.body).slice(0, 160)} ` +
            '(debería responder 200 a su propio residente)',
        );
        continue;
      }
      const cuerpo = JSON.stringify(res.body);
      if (esperaLista && !Array.isArray(res.body)) {
        fugas.push(`${clave} no devolvió una lista`);
      }
      for (const marca of MARCAS_VIVIENDA_2) {
        if (cuerpo.includes(marca)) fugas.push(`${clave} filtró «${marca}»`);
      }
    }
    expect(fugas, `FUGA entre viviendas: ${fugas.join(' | ')}`).toEqual([]);
  });

  it('y sí ve lo suyo: la comprobación no pasa porque todo venga vacío', async () => {
    const token = await tokenResidente(USUARIO_R1, COP_A);
    const vivienda = await pedir('/copropiedades/:id/mi/vivienda', COP_A, token);
    expect(vivienda.body.vivienda.identificador).toBe('42');
    expect(vivienda.body.vinculo.esTitular).toBe(true);
    expect(vivienda.body.puedeAutorizar).toBe(true);

    const familia = await pedir('/copropiedades/:id/mi/familia', COP_A, token);
    expect(familia.body).toHaveLength(2);
    expect(JSON.stringify(familia.body)).toContain('Maria Titular');

    const vehiculos = await pedir('/copropiedades/:id/mi/vehiculos', COP_A, token);
    expect(JSON.stringify(vehiculos.body)).toContain('ABC123');

    const historial = await pedir('/copropiedades/:id/mi/historial', COP_A, token);
    expect(historial.body).toHaveLength(1);
  });
});

describe('eje 1 · el residente tampoco cruza de copropiedad', () => {
  it('un residente de la B pidiendo la A recibe 404, no 403', async () => {
    // 404 y no 403 por lo mismo que en el primer eje: un 403 confirmaría que
    // el identificador existe, y contar respuestas permitiría enumerar.
    const token = await tokenResidente(USUARIO_RB, COP_B);
    for (const clave of Object.keys(RECORRIDAS)) {
      const res = await pedir(clave.slice(4), COP_A, token);
      expect(res.status, `${clave} → ${res.status}`).toBe(404);
    }
  });

  it('un residente con vínculo en otra copropiedad que su token no alcanza su vivienda', async () => {
    /**
     * El caso retorcido: token de la copropiedad A —legítimo— con un vínculo de
     * residente que en la base está en la B. No es una petición ilegítima: es
     * un dato incoherente, y el dominio lo distingue con su propio motivo para
     * que no se confunda con «no tiene vivienda».
     */
    const token = await tokenResidente(USUARIO_RB, COP_A);
    const res = await pedir('/copropiedades/:id/mi/vivienda', COP_A, token);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('otra copropiedad');
  });
});

describe('estados que el mockup no dibuja y la app necesita', () => {
  it('un residente sin vivienda activa recibe 404 con su motivo, no un 500', async () => {
    // Es el estado «aún no tiene vivienda asignada» de M-1. Un 500 lo haría
    // indistinguible de una caída, y la app pintaría «error» donde debe pintar
    // una explicación.
    const token = await tokenResidente(USUARIO_SIN_VIVIENDA, COP_A);
    const res = await pedir('/copropiedades/:id/mi/vivienda', COP_A, token);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toContain('vivienda activa');
  });

  it('las listas de un residente sin vivienda no son listas vacías: son 404', async () => {
    // Una lista vacía diría «no tiene familia ni vehículos», que es falso y
    // distinto de «no sabemos de qué vivienda hablamos».
    const token = await tokenResidente(USUARIO_SIN_VIVIENDA, COP_A);
    for (const clave of Object.keys(RECORRIDAS)) {
      const res = await pedir(clave.slice(4), COP_A, token);
      expect(res.status, `${clave} → ${res.status}`).toBe(404);
    }
  });
});

describe('la superficie del residente no es una superficie de administración', () => {
  it('un administrador de la misma copropiedad NO entra por /mi', async () => {
    /**
     * Podría parecer inofensivo —el administrador ya ve el padrón entero— y no
     * lo es: `/mi` resuelve la vivienda desde la identidad, y un administrador
     * no tiene vivienda. Abrirlo devolvería 404 a un rol que sí tiene permiso
     * para todo, y ese 404 acabaría «arreglándose» aceptando un `viviendaId`
     * por parámetro. Ahí se pierde el segundo eje.
     */
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    for (const clave of Object.keys(RECORRIDAS)) {
      const res = await pedir(clave.slice(4), COP_A, token);
      expect(res.status, `${clave} → ${res.status}`).toBe(403);
    }
  });

  it('un residente NO alcanza las rutas que se le retiraron, y el motivo queda escrito', async () => {
    const token = await tokenResidente(USUARIO_R1, COP_A);
    const alcanzadas: string[] = [];
    for (const { clave, motivo } of NEGADAS_AL_RESIDENTE) {
      const [metodo, ruta] = clave.split(' ');
      const destino = (ruta as string).replace(':id', COP_A).replace(/:[A-Za-z]+/g, OTRO_ID);
      const agente = request(app.getHttpServer());
      const peticion = metodo === 'POST' ? agente.post(destino) : agente.get(destino);
      const res = await peticion
        .set('Authorization', `Bearer ${token}`)
        .send({ autorizacionId: OTRO_ID });
      if (res.status !== 403) alcanzadas.push(`${clave} → ${res.status} · ${motivo}`);
    }
    expect(
      alcanzadas,
      `rutas que el residente vuelve a alcanzar: ${alcanzadas.join(' | ')}`,
    ).toEqual([]);
  });

  it('y un portero tampoco', async () => {
    const token = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A, aal: 'aal1' });
    const res = await pedir('/copropiedades/:id/mi/historial', COP_A, token);
    expect(res.status).toBe(403);
  });
});

describe('eje 2 · lo que el residente ESCRIBE cae en SU vivienda (11-B)', () => {
  /**
   * La mitad que faltaba. Hasta 11-B el segundo eje solo probaba lecturas, y
   * una escritura mal acotada es peor que una lectura mal acotada: la lectura
   * enseña la vida del vecino, la escritura **le abre la puerta**.
   *
   * Lo que se comprueba no es que la respuesta no filtre —una creación no
   * filtra nada—, sino DÓNDE cayó lo creado. Y se comprueba por el camino que
   * el residente tiene para verlo: su propia lista de autorizaciones.
   */
  it('las dos escrituras responden a su propio residente', async () => {
    const token = await tokenResidente(USUARIO_R1, COP_A);
    for (const [clave, { cuerpo }] of Object.entries(ESCRITURAS_DEL_AMBITO)) {
      const res = await enviar(clave.slice(5), COP_A, token, cuerpo);
      expect([200, 201], `${clave} → ${res.status} ${JSON.stringify(res.body)}`).toContain(
        res.status,
      );
    }
  });

  it('lo que crea R1 queda en la vivienda 1, y R2 no lo ve', async () => {
    const tokenR1 = await tokenResidente(USUARIO_R1, COP_A);
    const cuerpo = {
      ...ESCRITURAS_DEL_AMBITO['POST /copropiedades/:id/mi/autorizaciones']?.cuerpo,
      visitante: 'Marca de escritura de R1',
      claveDeIdempotencia: 'clave-de-aislamiento-escritura',
    };
    const creada = await enviar('/copropiedades/:id/mi/autorizaciones', COP_A, tokenR1, cuerpo);
    expect(creada.status).toBe(201);
    expect(creada.body.creada, JSON.stringify(creada.body)).toBe(true);

    // El doble guarda por ámbito; que el identificador devuelto exista bajo la
    // vivienda 1 y NO bajo la 2 es lo que demuestra que el ámbito llegó entero.
    const deLaUno = registroDeEscrituras().creadas.get(`${COP_A}:${VIVIENDA_1}`) ?? [];
    const deLaDos = registroDeEscrituras().creadas.get(`${COP_A}:${VIVIENDA_2}`) ?? [];
    expect(deLaUno.some((a) => a.id === creada.body.id)).toBe(true);
    expect(deLaDos.some((a) => a.nueva.visitante === 'Marca de escritura de R1')).toBe(false);
  });

  it('RN-17 · el mismo envío repetido NO crea una segunda visita', async () => {
    const token = await tokenResidente(USUARIO_R1, COP_A);
    const cuerpo = {
      ...ESCRITURAS_DEL_AMBITO['POST /copropiedades/:id/mi/autorizaciones']?.cuerpo,
      claveDeIdempotencia: 'clave-que-se-repite-0001',
    };
    const primera = await enviar('/copropiedades/:id/mi/autorizaciones', COP_A, token, cuerpo);
    const segunda = await enviar('/copropiedades/:id/mi/autorizaciones', COP_A, token, cuerpo);

    expect(primera.body.repetida).toBe(false);
    expect(segunda.body.repetida).toBe(true);
    expect(segunda.body.id).toBe(primera.body.id);
  });

  it('un residente SIN vivienda no puede escribir en ninguna', async () => {
    const token = await tokenResidente(USUARIO_SIN_VIVIENDA, COP_A);
    for (const [clave, { cuerpo }] of Object.entries(ESCRITURAS_DEL_AMBITO)) {
      // El cuerpo se envía TAL CUAL: el `ValidationPipe` global corre con
      // `forbidNonWhitelisted`, así que colar un campo de más daría 400 y la
      // prueba diría «no pudo escribir» por el motivo equivocado.
      const res = await enviar(clave.slice(5), COP_A, token, cuerpo);
      expect(res.status, `${clave} → ${res.status}`).toBe(404);
    }
  });
});

describe('M-4 · los rechazos llegan con su motivo TIPADO, no como un error', () => {
  /**
   * El residente tiene que poder distinguir «su vivienda está inactiva» de
   * «esta persona está vetada»: la primera se arregla llamando a la
   * administración y la segunda no se arregla. Un 403 con texto no permite
   * distinguirlas, y obligaría a la app a leer mensajes — que es D-79 otra vez.
   */
  const casos = [
    { hechos: { visitanteVetado: true }, motivo: 'LISTA_NEGRA' },
    { hechos: { viviendaActiva: false }, motivo: 'VIVIENDA_INACTIVA' },
    { hechos: { placaYaActiva: true }, motivo: 'PLACA_DUPLICADA' },
  ] as const;

  for (const [i, caso] of casos.entries()) {
    it(`${caso.motivo} llega con explicación y sin crear nada`, async () => {
      const registro = registroDeEscrituras();
      const antes = registro.hechos;
      registro.hechos = { ...antes, ...caso.hechos };
      try {
        const token = await tokenResidente(USUARIO_R1, COP_A);
        const res = await enviar('/copropiedades/:id/mi/autorizaciones', COP_A, token, {
          ...ESCRITURAS_DEL_AMBITO['POST /copropiedades/:id/mi/autorizaciones']?.cuerpo,
          placa: 'ABC123',
          claveDeIdempotencia: `rechazo-tipado-000${i}`,
        });
        expect(res.status).toBe(201);
        expect(res.body.creada).toBe(false);
        expect(res.body.motivo).toBe(caso.motivo);
        expect(String(res.body.explicacion).length).toBeGreaterThan(30);
        expect(res.body.id).toBeNull();
      } finally {
        registro.hechos = antes;
      }
    });
  }

  it('P-11 · un residente de nivel `solo_ingreso` no autoriza', async () => {
    // RB es el que tiene `solo_ingreso` en el doble, y vive en COP_B. El
    // criterio es el conservador de §2.1.4: solo `acceso_completo` autoriza.
    const token = await tokenResidente(USUARIO_RB, COP_B);
    const res = await enviar('/copropiedades/:id/mi/autorizaciones', COP_B, token, {
      ...ESCRITURAS_DEL_AMBITO['POST /copropiedades/:id/mi/autorizaciones']?.cuerpo,
      claveDeIdempotencia: 'sin-nivel-de-acceso-0001',
    });
    expect(res.body.creada).toBe(false);
    expect(res.body.motivo).toBe('SIN_NIVEL_DE_ACCESO');
  });
});
