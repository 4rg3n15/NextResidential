import { describe, expect, it } from 'vitest';
import type { LecturaDePlaca, Reloj } from '@ncr/domain-core';
import { crearProveedorDeEquipos } from '../fabrica';
import type { ProveedorDeEquipos } from '../fabrica';
import { PERFIL_IDEAL } from '../mock/simulacion';
import type { MockProvider } from '../mock/mock-provider';
import { HikvisionProvider } from '../hikvision/hikvision-provider';
import { equiposSimulados } from '../simulacion/equipo-simulado';
import type { EquipoRegistrado } from '../hikvision/registro-de-equipos';
import { RegistroEnMemoria } from '../hikvision/registro-de-equipos';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { desdeAlarmServerXml } from '../hikvision/contratos-de-evento';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA PRUEBA DE LSP · §2.3 y KPI-12, y el entregable que más pesa de esta etapa
 *
 * La misma suite, las mismas aserciones, **dos proveedores**. Si
 * `MockProvider` y `HikvisionProvider` no fueran intercambiables, esto se
 * pondría rojo; y si para ponerlo verde hiciera falta un `if (esMock)` dentro
 * de una aserción, el arreglo iría en el adaptador y no aquí.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO ÚNICO QUE DIFIERE ES EL MUNDO, NO LA ASERCIÓN
 *
 * Cada caso construye su proveedor y declara **cómo se le entrega una lectura**
 * —que es el transporte, es decir, lo único que un adaptador tiene derecho a
 * cambiar—. A partir de ahí, ni una rama: las mismas llamadas, las mismas
 * expectativas, los mismos valores.
 *
 * Que el estímulo difiera no es la trampa que esta suite persigue. La trampa
 * sería que el resultado observable dependiera de quién está detrás, y eso es
 * exactamente lo que se comprueba abajo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL SIMULADO VA EN PERFIL IDEAL, Y NO ES HACER TRAMPA
 *
 * `MockProvider` genera latencia y fallos con semilla; el equipo simulado del
 * otro lado no. Comparar los dos con adversidad en uno solo mediría el
 * generador de adversidad, no la equivalencia. La adversidad tiene su propia
 * suite —`mock-provider.test.ts`— y aquí estorba.
 */

const RELOJ: Reloj = { ahora: () => new Date('2026-09-23T12:00:00.000Z') };
const BARRERA = 'disp-talanquera';
const TERMINAL = 'disp-terminal';
const PORTERO = 'disp-porteria';
const DESCONOCIDO = 'disp-que-no-existe';

const EQUIPOS: readonly EquipoRegistrado[] = [
  {
    dispositivoId: BARRERA,
    tipo: 'camara_lpr',
    // RFC 5737: rango de DOCUMENTACIÓN. No es la dirección de nadie, y por eso
    // KPI-11 no la marca — el control lo comprueba con su propia sonda.
    host: '203.0.113.10',
    puerto: 80,
    protocolo: 'http',
    usuario: 'servicio',
    clave: 'clave-de-prueba',
  },
  {
    dispositivoId: TERMINAL,
    tipo: 'terminal_facial',
    host: '203.0.113.11',
    puerto: 80,
    protocolo: 'http',
    usuario: 'servicio',
    clave: 'clave-de-prueba',
    modoDeTerminal: 'reporta_y_espera',
  },
  {
    dispositivoId: PORTERO,
    tipo: 'intercom',
    host: '203.0.113.12',
    puerto: 80,
    protocolo: 'http',
    usuario: 'servicio',
    clave: 'clave-de-prueba',
    canalDeAudioHabilitado: true,
  },
];

const XML_DE_PLACA = (placa: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert version="2.0">' +
  '<eventType>ANPR</eventType><alarmDataType>0</alarmDataType>' +
  `<licensePlate>${placa}</licensePlate><confidenceLevel>92</confidenceLevel>` +
  '<eventId>ev-contrato</eventId></EventNotificationAlert>';

interface CasoDeContrato {
  readonly nombre: string;
  /** Construye un mundo nuevo por prueba: el estado no se comparte. */
  readonly montar: () => {
    readonly proveedor: ProveedorDeEquipos;
    /** El transporte. Es lo ÚNICO que cambia entre los dos. */
    readonly entregarLectura: (placa: string, dispositivoId: string) => Promise<void>;
  };
}

const CASOS: readonly CasoDeContrato[] = [
  {
    nombre: 'MockProvider',
    montar: () => {
      const proveedor = crearProveedorDeEquipos({
        clase: 'simulado',
        reloj: RELOJ,
        perfil: PERFIL_IDEAL,
        dispositivosSimulados: [BARRERA, TERMINAL, PORTERO],
      }) as MockProvider;
      return {
        proveedor,
        entregarLectura: async (placa, dispositivoId) => {
          await proveedor.emitirComoCamaraAnpr(placa, dispositivoId);
        },
      };
    },
  },
  {
    nombre: 'HikvisionProvider',
    montar: () => {
      const fuente = new FuenteDePlacas();
      const proveedor = new HikvisionProvider({
        registro: new RegistroEnMemoria(EQUIPOS),
        reloj: RELOJ,
        fuente,
        /**
         * Tres equipos de tres familias, cada uno en su dirección, como en la
         * red del conjunto. Con uno solo, las rutas de las otras dos familias
         * darían `404` y parecería un defecto del adaptador.
         */
        peticion: equiposSimulados({
          '203.0.113.10': { familia: 'camara', usuario: 'servicio', clave: 'clave-de-prueba' },
          '203.0.113.11': { familia: 'terminal', usuario: 'servicio', clave: 'clave-de-prueba' },
          '203.0.113.12': {
            familia: 'videoportero',
            usuario: 'servicio',
            clave: 'clave-de-prueba',
          },
        }),
      });
      return {
        proveedor,
        entregarLectura: async (placa, dispositivoId) => {
          const evento = desdeAlarmServerXml(XML_DE_PLACA(placa), dispositivoId, RELOJ.ahora());
          if (evento === null) throw new Error('el XML del contrato no se pudo normalizar');
          await fuente.publicar({ evento, foto: null, recorte: null, transporte: 'escucha' });
        },
      };
    },
  },
];

describe.each(CASOS)('contrato de proveedor · $nombre', (caso) => {
  describe('AccessPointProvider', () => {
    it('una apertura se acepta y devuelve una latencia medida, no inventada', async () => {
      const { proveedor } = caso.montar();
      const resultado = await proveedor.abrir(BARRERA, 'operador-1');
      expect(resultado.aceptado).toBe(true);
      expect(typeof resultado.latenciaMs).toBe('number');
      expect(resultado.latenciaMs).toBeGreaterThanOrEqual(0);
    });

    it('un dispositivo conocido está en línea', async () => {
      const { proveedor } = caso.montar();
      expect(await proveedor.estado(BARRERA)).toBe('en_linea');
    });

    it('un dispositivo que no existe está FUERA de línea, no degradado', async () => {
      // Son cosas distintas y se resuelven distinto: «no existe» es de alta,
      // «degradado» es de configuración. Colapsarlas manda a mirar el sitio malo.
      const { proveedor } = caso.montar();
      expect(await proveedor.estado(DESCONOCIDO)).toBe('fuera_de_linea');
    });
  });

  describe('PlateEventSource', () => {
    it('una lectura entregada llega al suscriptor, con su placa y su momento', async () => {
      const { proveedor, entregarLectura } = caso.montar();
      const recibidas: LecturaDePlaca[] = [];
      await proveedor.suscribir(async (lectura) => {
        recibidas.push(lectura);
      });

      await entregarLectura('ABC123', BARRERA);

      expect(recibidas.length).toBeGreaterThanOrEqual(1);
      expect(recibidas[0]?.placa).toBe('ABC123');
      expect(recibidas[0]?.dispositivoId).toBe(BARRERA);
      expect(recibidas[0]?.ocurridoEn).toBeInstanceOf(Date);
    });

    it('la confianza sale normalizada a 0..1, no en la escala del equipo', async () => {
      const { proveedor, entregarLectura } = caso.montar();
      const recibidas: LecturaDePlaca[] = [];
      await proveedor.suscribir(async (l) => {
        recibidas.push(l);
      });
      await entregarLectura('XYZ789', BARRERA);
      const confianza = recibidas[0]?.confianza ?? -1;
      expect(confianza).toBeGreaterThan(0);
      expect(confianza).toBeLessThanOrEqual(1);
    });

    it('admite más de un suscriptor y los avisa a todos', async () => {
      const { proveedor, entregarLectura } = caso.montar();
      let primero = 0;
      let segundo = 0;
      await proveedor.suscribir(async () => {
        primero += 1;
      });
      await proveedor.suscribir(async () => {
        segundo += 1;
      });
      await entregarLectura('DEF456', BARRERA);
      expect(primero).toBeGreaterThanOrEqual(1);
      expect(segundo).toBe(primero);
    });
  });

  describe('FaceTemplateProvider', () => {
    const PLANTILLA = new Uint8Array([1, 2, 3, 4]);

    it('sincroniza una plantilla contra la terminal sin quejarse', async () => {
      const { proveedor } = caso.montar();
      await expect(
        proveedor.sincronizar(TERMINAL, 'plantilla-1', PLANTILLA),
      ).resolves.toBeUndefined();
    });

    it('y la suprime, que es como se revoca un acceso facial (RN-11)', async () => {
      const { proveedor } = caso.montar();
      await proveedor.sincronizar(TERMINAL, 'plantilla-1', PLANTILLA);
      await expect(proveedor.suprimir(TERMINAL, 'plantilla-1')).resolves.toBeUndefined();
    });

    it('una plantilla VACÍA se rechaza: sincronizarla dejaría un rostro inservible', async () => {
      // Es lo que llega cuando la captura falló y nadie lo comprobó. En la
      // terminal quedaría una plantilla que no reconoce a nadie, nunca.
      const { proveedor } = caso.montar();
      await expect(proveedor.sincronizar(TERMINAL, 'vacia', new Uint8Array())).rejects.toThrow();
    });
  });

  describe('IntercomProvider · ADR-01', () => {
    it('el primer operador recibe el canal', async () => {
      const { proveedor } = caso.montar();
      expect(await proveedor.abrirSesion(PORTERO, 'operador-1')).toBe('abierta');
    });

    it('el SEGUNDO recibe `en_espera`, no un error', async () => {
      // Es la diferencia entre una consola que muestra una cola y una que
      // muestra un fallo. El canal es exclusivo en el aparato; la cola la
      // reparte el dominio, igual en los dos proveedores.
      const { proveedor } = caso.montar();
      await proveedor.abrirSesion(PORTERO, 'operador-1');
      expect(await proveedor.abrirSesion(PORTERO, 'operador-2')).toBe('en_espera');
    });

    it('sin sesión abierta, el estado es `cerrada`', async () => {
      const { proveedor } = caso.montar();
      expect(await proveedor.estadoSesion()).toBe('cerrada');
    });

    it('con sesión abierta, el estado es `abierta`', async () => {
      const { proveedor } = caso.montar();
      await proveedor.abrirSesion(PORTERO, 'operador-1');
      expect(await proveedor.estadoSesion()).toBe('abierta');
    });

    it('cerrar con motivo libera el canal', async () => {
      const { proveedor } = caso.montar();
      await proveedor.abrirSesion(PORTERO, 'operador-1');
      await proveedor.cerrarSesion('el visitante entró');
      expect(await proveedor.estadoSesion()).toBe('cerrada');
    });

    it('y liberado, el siguiente operador SÍ entra', async () => {
      const { proveedor } = caso.montar();
      await proveedor.abrirSesion(PORTERO, 'operador-1');
      await proveedor.cerrarSesion('el visitante entró');
      expect(await proveedor.abrirSesion(PORTERO, 'operador-2')).toBe('abierta');
    });
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Y LA COMPROBACIÓN QUE NO SE PUEDE PARAMETRIZAR, porque compara los dos
 *
 * Que cada uno cumpla su contrato por separado no basta: hay que ver que el
 * mismo estímulo produce el mismo resultado observable en los dos. Es lo que
 * distingue «dos implementaciones correctas» de «dos implementaciones
 * intercambiables», que es lo que ADR-03 promete.
 */
describe('los dos proveedores producen la MISMA lectura para el mismo estímulo', () => {
  const leerCon = async (caso: CasoDeContrato): Promise<LecturaDePlaca | undefined> => {
    const { proveedor, entregarLectura } = caso.montar();
    const recibidas: LecturaDePlaca[] = [];
    await proveedor.suscribir(async (l) => {
      recibidas.push(l);
    });
    await entregarLectura('ABC123', BARRERA);
    return recibidas[0];
  };

  it('misma placa, mismo dispositivo y misma escala de confianza', async () => {
    const primero = CASOS[0];
    const segundo = CASOS[1];
    if (primero === undefined || segundo === undefined) throw new Error('faltan casos');

    const [unoLeido, otroLeido] = await Promise.all([leerCon(primero), leerCon(segundo)]);

    expect(unoLeido?.placa).toBe(otroLeido?.placa);
    expect(unoLeido?.dispositivoId).toBe(otroLeido?.dispositivoId);
    // No se compara el valor exacto de confianza: el simulado la genera con
    // semilla y el otro la lee del sobre. Lo que TIENE que coincidir es la
    // escala, porque el umbral del dominio compara contra ella.
    expect(unoLeido?.confianza).toBeGreaterThan(0);
    expect(unoLeido?.confianza).toBeLessThanOrEqual(1);
    expect(otroLeido?.confianza).toBeGreaterThan(0);
    expect(otroLeido?.confianza).toBeLessThanOrEqual(1);
  });
});
