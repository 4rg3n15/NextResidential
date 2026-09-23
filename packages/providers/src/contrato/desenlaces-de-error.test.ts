import { describe, expect, it } from 'vitest';
import type { Reloj } from '@ncr/domain-core';
import { HikvisionProvider } from '../hikvision/hikvision-provider';
import { RegistroEnMemoria } from '../hikvision/registro-de-equipos';
import type { EquipoRegistrado } from '../hikvision/registro-de-equipos';
import { EquipoNoRegistrado } from '../hikvision/registro-de-equipos';
import { equipoSimulado, equiposSimulados } from '../simulacion/equipo-simulado';
import { EquipoDecidePorSuCuenta } from '../camara/modo-de-control';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS DESENLACES DE ERROR, QUE SON LA MITAD DEL ADAPTADOR
 *
 * El camino feliz de una ruta sin verificar prueba la suposición. Lo que decide
 * si este adaptador sirve en sitio es qué hace cuando el equipo dice que no, y
 * **cada «no» exige una reacción distinta**: reintentar uno que no se
 * reintenta bloquea la cuenta del aparato; no degradar ante un `notSupport`
 * deja una integración parada esperando algo que ese firmware no tiene.
 */

const RELOJ: Reloj = { ahora: () => new Date('2026-09-23T12:00:00.000Z') };
const CAMARA = 'disp-camara';
/** RFC 5737 · rango de DOCUMENTACIÓN: no es la dirección de nadie. */
const HOST = '203.0.113.20';

const equipo = (extra: Partial<EquipoRegistrado> = {}): EquipoRegistrado => ({
  dispositivoId: CAMARA,
  tipo: 'camara_lpr',
  host: HOST,
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  clave: 'clave-de-prueba',
  ...extra,
});

const proveedorCon = (peticion: typeof fetch, registrado = equipo()): HikvisionProvider =>
  new HikvisionProvider({
    registro: new RegistroEnMemoria([registrado]),
    reloj: RELOJ,
    peticion,
  });

const camaraConforme = (guion: Record<string, unknown> = {}): typeof fetch =>
  equiposSimulados({
    [HOST]: {
      familia: 'camara',
      usuario: 'servicio',
      clave: 'clave-de-prueba',
      ...guion,
    },
  });

describe('el equipo decide por su cuenta · las TRES vías bloquean', () => {
  it('vía 1 · el modo de control no es el de la plataforma', async () => {
    const proveedor = proveedorCon(camaraConforme({ ctrlMod: '0' }));
    await expect(proveedor.abrir(CAMARA, 'operador-1')).rejects.toBeInstanceOf(
      EquipoDecidePorSuCuenta,
    );
  });

  it('vía 1 bis · `2` tampoco es un término medio: sigue decidiendo él', async () => {
    const proveedor = proveedorCon(camaraConforme({ ctrlMod: '2' }));
    await expect(proveedor.abrir(CAMARA, 'operador-1')).rejects.toBeInstanceOf(
      EquipoDecidePorSuCuenta,
    );
  });

  it('vía 2 · la lista blanca del propio equipo abre sola', async () => {
    const proveedor = proveedorCon(camaraConforme({ operacionDeListaBlanca: 'on' }));
    await expect(proveedor.abrir(CAMARA, 'operador-1')).rejects.toBeInstanceOf(
      EquipoDecidePorSuCuenta,
    );
  });

  it('vía 3 · un disparador vinculado acciona una salida física', async () => {
    const proveedor = proveedorCon(camaraConforme({ disparadorAccionaPuerto: '1' }));
    await expect(proveedor.abrir(CAMARA, 'operador-1')).rejects.toBeInstanceOf(
      EquipoDecidePorSuCuenta,
    );
  });

  it('y el error dice QUÉ campo falla, no sólo que algo va mal', async () => {
    // Quien lo recibe tiene que poder decir en pantalla qué hay que cambiar.
    const proveedor = proveedorCon(camaraConforme({ operacionDeListaBlanca: 'on' }));
    await expect(proveedor.abrir(CAMARA, 'operador-1')).rejects.toThrow(/lista blanca/i);
  });

  it('un equipo conforme por las tres vías SÍ abre', async () => {
    const proveedor = proveedorCon(camaraConforme());
    const resultado = await proveedor.abrir(CAMARA, 'operador-1');
    expect(resultado.aceptado).toBe(true);
  });

  it('la guarda se comprueba UNA vez por dispositivo, no en cada apertura', async () => {
    // Es una comprobación de arranque, no un peaje por cada coche que llega.
    let consultas = 0;
    const contando: typeof fetch = (entrada, opciones) => {
      if (String(entrada).includes('entranceParam')) consultas += 1;
      return camaraConforme()(entrada, opciones);
    };
    const proveedor = proveedorCon(contando);
    await proveedor.abrir(CAMARA, 'operador-1');
    await proveedor.abrir(CAMARA, 'operador-1');
    // Dos viajes por consulta: el desafío Digest y la petición con credenciales.
    expect(consultas).toBeLessThanOrEqual(2);
  });
});

describe('los demás desenlaces, cada uno con su reacción', () => {
  it('INALCANZABLE · el equipo no contesta y no se inventa una apertura', async () => {
    const muerto: typeof fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const proveedor = proveedorCon(muerto, equipo({ tipo: 'rele' }));
    const resultado = await proveedor.abrir(CAMARA, 'operador-1');
    expect(resultado.aceptado).toBe(false);
  });

  it('CREDENCIAL RECHAZADA · el estado queda degradado, no fuera de línea', async () => {
    // Está vivo y mal configurado: se resuelve revisando el usuario de
    // servicio, no llamando al técnico de red.
    const rechaza: typeof fetch = () => Promise.resolve(new Response('', { status: 401 }));
    const proveedor = proveedorCon(rechaza);
    expect(await proveedor.estado(CAMARA)).toBe('degradado');
  });

  it('NO CONTESTA · el estado queda fuera de línea', async () => {
    const muerto: typeof fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    expect(await proveedorCon(muerto).estado(CAMARA)).toBe('fuera_de_linea');
  });

  it('RUTA NO SOPORTADA · el equipo dice que ese firmware no la tiene', async () => {
    const terminal = equipo({ dispositivoId: 'disp-terminal', tipo: 'terminal_facial' });
    const proveedor = new HikvisionProvider({
      registro: new RegistroEnMemoria([terminal]),
      reloj: RELOJ,
      peticion: equipoSimulado({
        familia: 'terminal',
        usuario: 'servicio',
        clave: 'clave-de-prueba',
        sinSoporte: ['cargar la plantilla facial'],
      }),
    });
    await expect(
      proveedor.sincronizar('disp-terminal', 'plantilla-1', new Uint8Array([1, 2])),
    ).rejects.toThrow(/no soporta/i);
  });

  it('EQUIPO NO REGISTRADO · no se adivina una dirección', async () => {
    const proveedor = proveedorCon(camaraConforme());
    await expect(
      proveedor.abrir('disp-que-nadie-dio-de-alta', 'operador-1'),
    ).rejects.toBeInstanceOf(EquipoNoRegistrado);
  });

  it('EL CANAL DE AUDIO DESHABILITADO no se enciende por nuestra cuenta', async () => {
    // Encender una vía de audio hacia la calle es una decisión de seguridad, y
    // no la toma el código.
    const portero = equipo({ dispositivoId: 'disp-portero', tipo: 'intercom' });
    const proveedor = new HikvisionProvider({
      registro: new RegistroEnMemoria([portero]),
      reloj: RELOJ,
      peticion: equipoSimulado({
        familia: 'videoportero',
        usuario: 'servicio',
        clave: 'clave-de-prueba',
      }),
    });
    await expect(proveedor.abrirSesion('disp-portero', 'operador-1')).rejects.toThrow(
      /deshabilitado/i,
    );
  });

  it('sincronizar contra un equipo que NO es terminal se niega, y dice por qué', async () => {
    // Dejaría el dato biométrico en un aparato donde nadie lo busca.
    const proveedor = proveedorCon(camaraConforme());
    await expect(proveedor.sincronizar(CAMARA, 'plantilla-1', new Uint8Array([1]))).rejects.toThrow(
      /no es una terminal facial/i,
    );
  });
});
