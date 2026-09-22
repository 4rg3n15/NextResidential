/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESCALAMIENTO DE PRIVILEGIOS ENTRE LOS SEIS ROLES · ETAPA 13 · §2.7.8
 *
 * La suite de aislamiento recorre el eje HORIZONTAL —una copropiedad contra
 * otra— y es la que cierra KPI-36 a 38. Este recorrido es el eje VERTICAL,
 * DENTRO de la misma copropiedad: un portero pidiendo el padrón, un residente
 * pidiendo la configuración, un operador de central abriendo una puerta.
 *
 * Hasta la ETAPA 13 estaba cubierto a mano y por muestreo: el aislamiento
 * comprueba que un portero no lee la configuración y que un residente no
 * alcanza el padrón, pero nadie recorría la matriz COMPLETA. Un endpoint nuevo
 * con el `@Roles` mal puesto no lo veía nadie hasta que alguien lo probara.
 *
 * Aquí la matriz se DERIVA del enrutador y de los decoradores, no se escribe:
 * seis roles × todas las rutas protegidas. Si una ruta admite a quien no
 * declara, esto se pone rojo el día que se escribe.
 *
 * LO QUE SE EXIGE es «no 2xx», no un código concreto. El sistema responde 403
 * cuando el rol no basta y 404 cuando además el recurso es ajeno —y ese 404 es
 * deliberado: un 403 confirmaría que el identificador existe—. Exigir un
 * código fijo obligaría a elegir entre las dos políticas correctas.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  COP_A,
  crearApp,
  crearFirmante,
  enumerarRutas,
  rutasConMetadato,
  rutasConRol,
  tokenDe,
} from './utilidades';
import type { Firmante, RutaExpuesta } from './utilidades';
import { CLAVE_PUBLICO } from '../src/comun/decoradores';
import type { Rol } from '../src/autenticacion/dominio/claims';

const ROLES: readonly Rol[] = [
  'superadministrador',
  'administrador',
  'portero',
  'operador_central',
  'residente',
  'servicio',
];

/**
 * Las rutas sin sesión se DERIVAN del decorador `@Publico()`, no se escriben.
 * Escribirlas a mano fue el primer intento y costó un rojo legítimo: faltaban
 * las tres de `/ingesta/*`, que no llevan `@Roles` porque no las protege un rol
 * sino la firma HMAC del equipo emisor. Una lista a mano envejece en el
 * endpoint siguiente; el decorador, no.
 */
let PUBLICAS = new Set<string>();

const OTRO_ID = '00000000-0000-4000-8000-0000000000ff';

let app: INestApplication;
let firmante: Firmante;
let rutas: RutaExpuesta[];
const permitidasPorRol = new Map<Rol, Set<string>>();
const tokens = new Map<Rol, string>();

const clave = (r: RutaExpuesta) => `${r.metodo} ${r.ruta}`;

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  rutas = enumerarRutas(app);
  PUBLICAS = new Set(rutasConMetadato(app, CLAVE_PUBLICO));
  for (const rol of ROLES) {
    permitidasPorRol.set(rol, new Set(rutasConRol(app, rol).map(clave)));
    tokens.set(
      rol,
      await tokenDe(firmante, {
        rol,
        // El superadministrador y el servicio no pertenecen a una copropiedad;
        // los demás sí. Darles a todos `COP_A` haría que el rechazo viniera del
        // aislamiento y no del rol, y la prueba diría lo que no es.
        copropiedadId: rol === 'superadministrador' ? null : COP_A,
        ...(rol === 'operador_central' ? { copropiedadesAtendidas: [COP_A] } : {}),
      }),
    );
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
});

const invocar = (r: RutaExpuesta, token: string) => {
  const ruta = r.ruta.replace(':id', COP_A).replace(/:[A-Za-z]+/g, OTRO_ID);
  const agente = request(app.getHttpServer());
  const verbo = r.metodo.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
  const peticion = agente[verbo](ruta).set('Authorization', `Bearer ${token}`);
  return r.metodo === 'GET' ? peticion : peticion.send({});
};

describe('la matriz se deriva del código y no está vacía', () => {
  it('hay rutas y hay roles que enumerar', () => {
    expect(rutas.length).toBeGreaterThan(50);
    for (const rol of ROLES) expect(permitidasPorRol.get(rol)).toBeDefined();
  });

  it('ninguna ruta protegida se queda sin `@Roles`: sin él, el guard deniega', () => {
    // `roles.guard.ts` responde 403 a una ruta sin `@Roles()`, así que una ruta
    // sin declarar no es un agujero — es un endpoint muerto. Se cuenta para que
    // el número salga en pantalla y nadie lo confunda con cobertura.
    const declaradas = new Set<string>();
    for (const rol of ROLES) for (const r of permitidasPorRol.get(rol)!) declaradas.add(r);
    const protegidas = rutas.filter((r) => !PUBLICAS.has(r.ruta));
    const sinRoles = protegidas.filter((r) => !declaradas.has(clave(r))).map(clave);
    expect(sinRoles, `rutas sin @Roles(): ${sinRoles.join(', ')}`).toEqual([]);
  });
});

for (const rol of ROLES) {
  describe(`rol ${rol} · no alcanza lo que no declara`, () => {
    it('ninguna ruta ajena a su rol responde 2xx', async () => {
      const permitidas = permitidasPorRol.get(rol)!;
      const token = tokens.get(rol)!;
      const coladas: string[] = [];
      let probadas = 0;

      for (const r of rutas) {
        if (PUBLICAS.has(r.ruta) || permitidas.has(clave(r))) continue;
        probadas += 1;
        const respuesta = await invocar(r, token);
        if (respuesta.status >= 200 && respuesta.status < 300) {
          coladas.push(`${clave(r)} -> ${respuesta.status}`);
        }
      }

      /**
       * Que el recorrido no se quede corto sin que nadie lo note: un filtro mal
       * escrito dejaría la prueba en verde sin haber pedido una sola ruta. Se
       * compara con el número EXACTO que sale de la resta —rutas totales menos
       * públicas menos las que el rol declara—, no con un mínimo a ojo: un
       * mínimo pasa igual cuando faltan la mitad.
       */
      const esperadas = rutas.filter(
        (r) => !PUBLICAS.has(r.ruta) && !permitidas.has(clave(r)),
      ).length;
      expect(probadas).toBe(esperadas);
      expect(esperadas).toBeGreaterThan(0);
      expect(coladas, `${rol} alcanzó rutas que no declara:\n${coladas.join('\n')}`).toEqual([]);
    }, 120_000);
  });
}
