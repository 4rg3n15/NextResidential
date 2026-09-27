import { describe, expect, it } from 'vitest';
import { ClienteDeEquipo, EscrituraSinCuerpo } from './cliente';
import { RUTAS, opcionesDeEscritura, rutaPara } from './catalogo-de-rutas';
import { abrirPuertaRemota } from './puerta-remota';
import { TerminalFacial } from '../terminal/terminal-facial';
import { Videoportero } from '../videoportero/videoportero';
import { descubrirCapacidades } from '../hikvision/capacidades-hikvision';
import { diagnosticarEquipo } from '../diagnostico/diagnostico-de-equipo';
import {
  aperturasFisicasPor,
  equipoSimulado,
  escriturasSinCuerpoPor,
} from '../simulacion/equipo-simulado';
import { CredencialRechazada, OrdenSinConfirmar } from '../nucleo/errores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANEXO 15-K · LO DEMOSTRADO EN SITIO, CONTRA EL SIMULADO QUE LO REPRODUCE
 *
 * La terminal (V4.47.0) y el videoportero (V2.3.9) ABRIERON con `PUT door/1`,
 * Content-Type `application/x-www-form-urlencoded; charset=UTF-8`, el cuerpo
 * con espacio de nombres ISAPI y `version="2.0"`, y el Digest con el cuerpo
 * desde la primera petición: 401 y después 200 statusCode=1. Cada prueba de
 * aquí falla si se deshace la corrección que la acompaña.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const USUARIO = 'servicio';
const CLAVE = 'clave-de-prueba';

interface Vista {
  readonly metodo: string;
  readonly ruta: string;
  readonly tipo: string | undefined;
  readonly cuerpo: string;
  readonly autorizada: boolean;
  estado?: number;
}

/** El simulado, con cada petición anotada tal como salió del cliente. */
const espiado = (simulado: typeof fetch): { peticion: typeof fetch; vistas: Vista[] } => {
  const vistas: Vista[] = [];
  const peticion: typeof fetch = async (url, opciones) => {
    const cabeceras = (opciones?.headers ?? {}) as Record<string, string>;
    const vista: Vista = {
      metodo: opciones?.method ?? 'GET',
      ruta: new URL(String(url)).pathname,
      tipo: cabeceras['content-type'],
      cuerpo: typeof opciones?.body === 'string' ? opciones.body : '',
      autorizada: cabeceras['authorization'] !== undefined,
    };
    vistas.push(vista);
    const r = await simulado(url, opciones);
    vista.estado = r.status;
    return r;
  };
  return { peticion, vistas };
};

const conexion = (peticion: typeof fetch) => ({
  host: `equipo-${String(Math.random()).slice(2)}.invalid`,
  usuario: USUARIO,
  clave: CLAVE,
  peticion,
});

describe('anexo 15-K · H-SITIO-13 · la apertura remota que abrió en sitio', () => {
  it('terminal: cuerpo con espacio de nombres, Content-Type del anexo, y la puerta SE MUEVE', async () => {
    const destino = 'anexo-terminal-1';
    const { peticion, vistas } = espiado(
      equipoSimulado({ familia: 'terminal', usuario: USUARIO, clave: CLAVE, destino }),
    );
    const terminal = new TerminalFacial({
      ...conexion(peticion),
      modo: 'decide_el_equipo',
      numeroDePuerta: 1,
    });
    const antes = aperturasFisicasPor.get(destino) ?? 0;
    await expect(terminal.abrir(destino, 'operador-1')).resolves.toMatchObject({ aceptado: true });
    expect(aperturasFisicasPor.get(destino)).toBe(antes + 1);

    const puertas = vistas.filter((v) => v.ruta === '/ISAPI/AccessControl/RemoteControl/door/1');
    expect(puertas.map((v) => v.estado)).toEqual([401, 200]);
    for (const v of puertas) {
      expect(v.metodo).toBe('PUT');
      expect(v.tipo).toBe('application/x-www-form-urlencoded; charset=UTF-8');
      expect(v.cuerpo).toBe(
        '<RemoteControlDoor xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0">' +
          '<cmd>open</cmd></RemoteControlDoor>',
      );
    }
    // (d) · el cuerpo YA viaja en la primera petición, la que recibe el 401.
    expect(puertas[0]?.autorizada).toBe(false);
  });

  it('videoportero: el mismo documento con la declaración XML de su interfaz, y abre', async () => {
    const destino = 'anexo-videoportero-1';
    const { peticion, vistas } = espiado(
      equipoSimulado({ familia: 'videoportero', usuario: USUARIO, clave: CLAVE, destino }),
    );
    const videoportero = new Videoportero({ ...conexion(peticion), numeroDePuerta: 1 });
    const antes = aperturasFisicasPor.get(destino) ?? 0;
    await expect(videoportero.abrir(destino, 'operador-1')).resolves.toMatchObject({
      aceptado: true,
    });
    expect(aperturasFisicasPor.get(destino)).toBe(antes + 1);
    const puerta = vistas.find((v) => v.estado === 200 && v.ruta.endsWith('/door/1'));
    expect(
      puerta?.cuerpo.startsWith("<?xml version='1.0' encoding='utf-8'?><RemoteControlDoor"),
    ).toBe(true);
    expect(puerta?.tipo).toBe('application/x-www-form-urlencoded; charset=UTF-8');
  });

  it('el cuerpo mínimo de antes contesta statusCode 1 «OK» y la puerta NO se mueve', async () => {
    // Es el comportamiento de sitio que el simulado reproduce: por eso la
    // consola no puede decir «abierta», y por eso el recorrido mira el equipo.
    const destino = 'anexo-minimo-1';
    const cliente = new ClienteDeEquipo(
      conexion(equipoSimulado({ familia: 'terminal', usuario: USUARIO, clave: CLAVE, destino })),
    );
    const r = await cliente.pedir('PUT', '/ISAPI/AccessControl/RemoteControl/door/1', {
      tipo: 'application/xml',
      contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
    });
    expect(r.cuerpo).toMatch(/<statusCode>1<\/statusCode>/);
    expect(aperturasFisicasPor.get(destino) ?? 0).toBe(0);
  });
});

describe('anexo 15-K · H-SITIO-15 · nunca una escritura con el cuerpo vacío', () => {
  it('el equipo valida el cuerpo ANTES de autenticar: 400 badXmlContent, sin desafío', async () => {
    const destino = 'anexo-vacio-1';
    const simulado = equipoSimulado({
      familia: 'terminal',
      usuario: USUARIO,
      clave: CLAVE,
      destino,
    });
    const r = await simulado('http://t.invalid/ISAPI/AccessControl/RemoteControl/door/1', {
      method: 'PUT',
    });
    expect(r.status).toBe(400);
    expect(await r.text()).toMatch(/badXmlContent[\s\S]*1610612739/);
    expect(escriturasSinCuerpoPor.get(destino)).toBe(1);
  });

  it('el cliente se niega a enviarla: una escritura sin cuerpo es un error nuestro, dicho aquí', async () => {
    const cliente = new ClienteDeEquipo(
      conexion(equipoSimulado({ familia: 'terminal', usuario: USUARIO, clave: CLAVE })),
    );
    await expect(cliente.pedir('PUT', '/ISAPI/AccessControl/RemoteControl/door/1')).rejects.toThrow(
      EscrituraSinCuerpo,
    );
  });

  it('sólo el canal de audio declara su escritura sin cuerpo; el resto la lleva o no escribe', () => {
    const sinCuerpo = RUTAS.filter((r) => opcionesDeEscritura(r).sinCuerpo === true).map(
      (r) => r.proposito,
    );
    expect(sinCuerpo.sort()).toEqual([
      'abrir el canal de audio bidireccional',
      'cerrar el canal de audio bidireccional',
    ]);
    expect(
      opcionesDeEscritura(rutaPara('abrir la puerta desde la plataforma', 'terminal', 1)),
    ).toEqual({});
  });

  it('descubrir y diagnosticar la terminal no deja ni un POST vacío, y la biblioteca se cuenta', async () => {
    // Antes del anexo, el recuento era un POST vacío (la guía lo documenta GET)
    // y la búsqueda de sondeo también: la terminal real contestaba 400.
    const destino = 'anexo-diagnostico-1';
    const simulado = equipoSimulado({
      familia: 'terminal',
      usuario: USUARIO,
      clave: CLAVE,
      destino,
      bibliotecaAlmacenadas: 3,
    });
    const c = conexion(simulado);
    const capacidades = await descubrirCapacidades({
      cliente: new ClienteDeEquipo(c),
      familia: 'terminal',
    });
    await diagnosticarEquipo({ ...c, familia: 'terminal' });
    expect(escriturasSinCuerpoPor.get(destino) ?? 0).toBe(0);
    expect(capacidades.bibliotecaDeRostros).toMatchObject({ estado: 'si', almacenadas: 3 });
  });
});

describe('anexo 15-K · (c) «aceptada» sólo con statusCode 1 y su subStatusCode', () => {
  const clienteQueContesta = (cuerpo: string): ClienteDeEquipo =>
    new ClienteDeEquipo(
      conexion(
        async () =>
          ({
            status: 200,
            ok: true,
            headers: new Headers(),
            text: async () => cuerpo,
            body: null,
          }) as unknown as Response,
      ),
    );
  const ruta = rutaPara('abrir la puerta desde la plataforma', 'terminal', 1);

  it.each([
    [
      'un 200 sin ResponseStatus',
      '<ResponseStatus><statusString>OK</statusString></ResponseStatus>',
    ],
    [
      'statusCode 1 sin subStatusCode',
      '<ResponseStatus><statusCode>1</statusCode></ResponseStatus>',
    ],
  ])('%s NO es una orden aceptada', async (_caso, cuerpo) => {
    await expect(abrirPuertaRemota(clienteQueContesta(cuerpo), ruta, 't-1')).rejects.toBeInstanceOf(
      OrdenSinConfirmar,
    );
  });

  it('statusCode 0 tampoco: sólo 1 es «aceptada»', async () => {
    const cuerpo =
      '<ResponseStatus><statusCode>0</statusCode><subStatusCode>ok</subStatusCode></ResponseStatus>';
    await expect(abrirPuertaRemota(clienteQueContesta(cuerpo), ruta, 't-1')).rejects.toBeDefined();
  });
});

describe('anexo 15-K · (d) el Digest: nonce vencido, un reintento; 401 sin stale, ninguno', () => {
  it('con el nonce vencido la siguiente orden se renegocia UNA vez y se acepta', async () => {
    let t = 0;
    const destino = 'anexo-nonce-1';
    const { peticion, vistas } = espiado(
      equipoSimulado({
        familia: 'terminal',
        usuario: USUARIO,
        clave: CLAVE,
        destino,
        nonce: { vigenciaMs: 20_000, ahora: () => t },
      }),
    );
    const terminal = new TerminalFacial({
      ...conexion(peticion),
      modo: 'decide_el_equipo',
      numeroDePuerta: 1,
    });
    await terminal.abrir(destino, 'operador-1');
    t += 25_000; // en sitio, la segunda orden llegó entre 9 y 35 s después
    await expect(terminal.abrir(destino, 'operador-1')).resolves.toMatchObject({ aceptado: true });
    const segunda = vistas.slice(2).map((v) => v.estado);
    expect(segunda).toEqual([401, 200]);
    expect(aperturasFisicasPor.get(destino)).toBe(2);
  });

  it('con la credencial ya enviada, un 401 SIN stale es la clave y no se repite', async () => {
    // El equipo cambia de clave entre dos órdenes: la segunda viaja con un
    // resumen que ya no vale. Un segundo intento sólo acercaría el bloqueo.
    let clave = CLAVE;
    const simulados = new Map<string, typeof fetch>();
    const actual = (): typeof fetch => {
      const s =
        simulados.get(clave) ?? equipoSimulado({ familia: 'terminal', usuario: USUARIO, clave });
      simulados.set(clave, s);
      return s;
    };
    const { peticion, vistas } = espiado((url, opciones) => actual()(url, opciones));
    const terminal = new TerminalFacial({
      ...conexion(peticion),
      modo: 'decide_el_equipo',
      numeroDePuerta: 1,
    });
    await terminal.abrir('t-clave', 'operador-1');
    clave = 'otra-clave';
    const antes = vistas.length;
    await expect(terminal.abrir('t-clave', 'operador-1')).rejects.toBeInstanceOf(
      CredencialRechazada,
    );
    expect(vistas.length - antes).toBe(1);
  });
});
