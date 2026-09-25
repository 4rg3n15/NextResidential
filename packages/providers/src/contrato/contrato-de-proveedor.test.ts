import { describe, expect, it } from 'vitest';
import type { LecturaDePlaca, Reloj } from '@ncr/domain-core';
import { crearProveedorDeEquipos } from '../fabrica';
import type { ProveedorDeEquipos } from '../fabrica';
import { PERFIL_IDEAL } from '../mock/simulacion';
import type { MockProvider } from '../mock/mock-provider';
import { HikvisionProvider } from '../hikvision/hikvision-provider';
import { equiposSimulados } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import type { EquipoRegistrado } from '../hikvision/registro-de-equipos';
import { RegistroEnMemoria } from '../hikvision/registro-de-equipos';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { desdeAlarmServerXml } from '../hikvision/contratos-de-evento';
import { CLASE_FICTICIA, registrarAdaptadorFicticio } from '../ficticio/registrar';
import type { ConfiguracionFicticia } from '../ficticio/registrar';
import type { EquipoFicticio, ProveedorFicticio } from '../ficticio/proveedor-ficticio';
import { capacidadesDeclaradas, estadoDe, soporta } from '../nucleo/capacidades';
import {
  BibliotecaLlena,
  CapacidadNoSoportada,
  CredencialRechazada,
  EquipoAveriado,
  EquipoOcupado,
  ReinicioNecesario,
} from '../nucleo/errores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA PRUEBA DE LSP · §2.3 y KPI-12, y la prueba de fuego de O2 (ETAPA 15-D)
 *
 * La misma suite, las mismas aserciones, **tres proveedores**: el simulado, el
 * real contra un equipo simulado, y **una marca inventada con capacidades
 * reducidas**. Si no fueran intercambiables, esto se pondría rojo; y si para
 * ponerlo verde hiciera falta un `if (esOrbita)` dentro de una aserción, el
 * arreglo iría en el adaptador y no aquí.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO ÚNICO QUE DIFIERE ES EL MUNDO, NO LA ASERCIÓN
 *
 * Cada caso construye su proveedor a partir de un **mundo**: qué equipos hay,
 * qué pueden hacer y qué les pasa. El mundo se describe en lenguaje neutro
 * —«el portero no admite apertura remota», «la terminal está llena»— y cada
 * caso lo traduce a lo suyo: un guion del simulador, una lista de equipos
 * ficticios. A partir de ahí, ni una rama.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y LA ASERCIÓN SE ESCRIBE CONTRA LAS CAPACIDADES, NO CONTRA LA MARCA
 *
 * «Si el equipo declara biblioteca de rostros, sincronizar resuelve; si
 * declara que no, `CapacidadNoSoportada`». Es la misma frase para los tres, y
 * es lo que permite que un equipo con menos capacidades pase la suite sin
 * que la suite sepa de qué marca es.
 *
 * El simulado (`MockProvider`) no participa en los mundos adversos: finge un
 * equipo completo y sano, y ampliarlo con perillas de avería sería reescribir
 * lo que funciona. Cada mundo adverso lo ejercitan al menos DOS proveedores,
 * y eso se comprueba abajo: una adversidad que sólo probara uno no sería un
 * contrato, sería una prueba de ese adaptador.
 */

const RELOJ: Reloj = { ahora: () => new Date('2026-09-23T12:00:00.000Z') };
const BARRERA = 'disp-talanquera';
const TERMINAL = 'disp-terminal';
const PORTERO = 'disp-porteria';
const DESCONOCIDO = 'disp-que-no-existe';

/** Lo que le puede pasar al mundo. Todo falso = equipos completos y sanos. */
interface MundoDeContrato {
  readonly terminalSinBiblioteca?: boolean;
  readonly terminalSinCapacidadesConocidas?: boolean;
  readonly bibliotecaLlena?: boolean;
  readonly porteroSinAperturaRemota?: boolean;
  readonly porteroSinAudio?: boolean;
  readonly porteroOcupado?: boolean;
  readonly porteroAveriado?: boolean;
  readonly porteroReinicioNecesario?: boolean;
  readonly porteroCredencialRechazada?: boolean;
  readonly porteroInalcanzable?: boolean;
}
type Adversidad = keyof MundoDeContrato;

const ADVERSIDADES: readonly Adversidad[] = [
  'terminalSinBiblioteca',
  'terminalSinCapacidadesConocidas',
  'bibliotecaLlena',
  'porteroSinAperturaRemota',
  'porteroSinAudio',
  'porteroOcupado',
  'porteroAveriado',
  'porteroReinicioNecesario',
  'porteroCredencialRechazada',
  'porteroInalcanzable',
];

const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

const EQUIPOS: readonly EquipoRegistrado[] = [
  {
    dispositivoId: BARRERA,
    tipo: 'camara_lpr',
    // RFC 5737: rango de DOCUMENTACIÓN. No es la dirección de nadie, y por eso
    // KPI-11 no la marca — el control lo comprueba con su propia sonda.
    host: '203.0.113.10',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
  },
  {
    dispositivoId: TERMINAL,
    tipo: 'terminal_facial',
    host: '203.0.113.11',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    modoDeTerminal: 'reporta_y_espera',
    numeroDePuerta: 1,
  },
  {
    dispositivoId: PORTERO,
    tipo: 'intercom',
    host: '203.0.113.12',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    canalDeAudioHabilitado: true,
    numeroDePuerta: 1,
  },
];

const XML_DE_PLACA = (placa: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert version="2.0">' +
  '<eventType>ANPR</eventType><alarmDataType>0</alarmDataType>' +
  `<licensePlate>${placa}</licensePlate><confidenceLevel>92</confidenceLevel>` +
  '<eventId>ev-contrato</eventId></EventNotificationAlert>';

interface CasoDeContrato {
  readonly nombre: string;
  /** Qué adversidades sabe materializar este caso. */
  readonly adversidades: ReadonlySet<Adversidad>;
  /** Construye un mundo nuevo por prueba: el estado no se comparte. */
  readonly montar: (mundo?: MundoDeContrato) => {
    readonly proveedor: ProveedorDeEquipos;
    /** El transporte. Es lo ÚNICO que cambia entre los tres. */
    readonly entregarLectura: (placa: string, dispositivoId: string) => Promise<void>;
  };
}

// ── Caso 1 · el simulado ─────────────────────────────────────────────────────
const SIMULADO: CasoDeContrato = {
  nombre: 'MockProvider',
  adversidades: new Set(),
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
};

// ── Caso 2 · el real, contra tres equipos simulados en tres direcciones ─────
const guionDePortero = (mundo: MundoDeContrato): GuionDeEquipo => ({
  familia: 'videoportero',
  ...CREDENCIAL,
  ...(mundo.porteroSinAperturaRemota === true ? { aperturaRemota: false } : {}),
  ...(mundo.porteroSinAudio === true ? { canalesDeAudio: [] } : {}),
  ...(mundo.porteroOcupado === true ? { ocupado: true } : {}),
  ...(mundo.porteroAveriado === true ? { averiado: true } : {}),
  ...(mundo.porteroReinicioNecesario === true ? { reinicioNecesario: true } : {}),
  ...(mundo.porteroCredencialRechazada === true ? { rechazaCredencial: true } : {}),
});

const guionDeTerminal = (mundo: MundoDeContrato): GuionDeEquipo => ({
  familia: 'terminal',
  ...CREDENCIAL,
  ...(mundo.bibliotecaLlena === true ? { bibliotecaMaximo: 1, bibliotecaAlmacenadas: 1 } : {}),
  ...(mundo.terminalSinCapacidadesConocidas === true ? { sinCapacidades: true } : {}),
});

const HIKVISION: CasoDeContrato = {
  nombre: 'HikvisionProvider',
  adversidades: new Set(ADVERSIDADES),
  montar: (mundo = {}) => {
    const fuente = new FuenteDePlacas();
    const simulados = equiposSimulados({
      '203.0.113.10': { familia: 'camara', ...CREDENCIAL },
      '203.0.113.11': guionDeTerminal(mundo),
      '203.0.113.12': guionDePortero(mundo),
    });
    // «Inalcanzable» es la red, no el equipo: esa dirección no contesta.
    const peticion: typeof fetch = (entrada, opciones) =>
      mundo.porteroInalcanzable === true && String(entrada).includes('203.0.113.12')
        ? Promise.reject(new Error('connect ECONNREFUSED'))
        : simulados(entrada, opciones);
    const equipos = EQUIPOS.map((e) =>
      e.dispositivoId === TERMINAL && mundo.terminalSinBiblioteca === true
        ? {
            ...e,
            // Lo que la consola persistiría tras descubrir un equipo sin biblioteca.
            capacidades: capacidadesDeclaradas({
              aperturaRemota: 'si',
              verificacionRemota: 'si',
              bibliotecaDeRostros: { estado: 'no', maximo: null, almacenadas: null },
            }),
          }
        : e,
    );
    const proveedor = new HikvisionProvider({
      registro: new RegistroEnMemoria(equipos),
      reloj: RELOJ,
      fuente,
      peticion,
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
};

// ── Caso 3 · la marca inventada, con capacidades reducidas ───────────────────
registrarAdaptadorFicticio();

const equiposFicticios = (mundo: MundoDeContrato): readonly EquipoFicticio[] => [
  {
    dispositivoId: BARRERA,
    capacidades: capacidadesDeclaradas({
      aperturaRemota: 'si',
      reconocimientoDePlacas: 'si',
      bloqueoDeAcceso: 'si',
    }),
  },
  {
    dispositivoId: TERMINAL,
    capacidades:
      mundo.terminalSinCapacidadesConocidas === true
        ? capacidadesDeclaradas({})
        : capacidadesDeclaradas({
            aperturaRemota: 'si',
            verificacionRemota: 'si',
            bibliotecaDeRostros: {
              estado: mundo.terminalSinBiblioteca === true ? 'no' : 'si',
              maximo: mundo.bibliotecaLlena === true ? 0 : 200,
              almacenadas: 0,
            },
          }),
    ...(mundo.bibliotecaLlena === true ? { adversidad: 'biblioteca_llena' as const } : {}),
  },
  {
    dispositivoId: PORTERO,
    // Órbita: sin señalización de llamada ni gestión de personas. Reducido.
    capacidades: capacidadesDeclaradas({
      aperturaRemota: mundo.porteroSinAperturaRemota === true ? 'no' : 'si',
      audioBidireccional: {
        estado: mundo.porteroSinAudio === true ? 'no' : 'si',
        canal: 1,
        formato: 'g711u',
      },
      senalizacionDeLlamada: 'no',
    }),
    ...(mundo.porteroOcupado === true ? { adversidad: 'ocupado' as const } : {}),
    ...(mundo.porteroAveriado === true ? { adversidad: 'averiado' as const } : {}),
    ...(mundo.porteroReinicioNecesario === true
      ? { adversidad: 'reinicio_necesario' as const }
      : {}),
    ...(mundo.porteroCredencialRechazada === true
      ? { adversidad: 'credencial_rechazada' as const }
      : {}),
    ...(mundo.porteroInalcanzable === true ? { adversidad: 'inalcanzable' as const } : {}),
  },
];

const FICTICIO: CasoDeContrato = {
  nombre: 'ProveedorFicticio (marca inventada «Órbita»)',
  adversidades: new Set(ADVERSIDADES),
  montar: (mundo = {}) => {
    const configuracion: ConfiguracionFicticia = {
      clase: CLASE_FICTICIA,
      reloj: RELOJ,
      equiposFicticios: equiposFicticios(mundo),
    };
    const proveedor = crearProveedorDeEquipos(configuracion) as ProveedorFicticio;
    return {
      proveedor,
      entregarLectura: async (placa, dispositivoId) => {
        await proveedor.entregarLectura(placa, dispositivoId);
      },
    };
  },
};

const CASOS: readonly CasoDeContrato[] = [SIMULADO, HIKVISION, FICTICIO];

describe.each(CASOS)('contrato de proveedor · $nombre', (caso) => {
  describe('capacidades', () => {
    it('un dispositivo conocido declara sus capacidades con su origen', async () => {
      const { proveedor } = caso.montar();
      const capacidades = await proveedor.capacidadesDe(BARRERA);
      expect(capacidades.origen).not.toBe('sin_consultar');
      expect(soporta(capacidades, 'aperturaRemota')).toBe(true);
    });

    it('uno desconocido no tiene capacidades: nadie las consultó', async () => {
      const { proveedor } = caso.montar();
      const capacidades = await proveedor.capacidadesDe(DESCONOCIDO);
      expect(capacidades.origen).toBe('sin_consultar');
      expect(estadoDe(capacidades, 'aperturaRemota')).toBe('desconocida');
    });
  });

  describe('AccessPointProvider', () => {
    it('una apertura se acepta y devuelve una latencia medida, no inventada', async () => {
      const { proveedor } = caso.montar();
      const resultado = await proveedor.abrir(BARRERA, 'operador-1');
      expect(resultado.aceptado).toBe(true);
      expect(typeof resultado.latenciaMs).toBe('number');
      expect(resultado.latenciaMs).toBeGreaterThanOrEqual(0);
    });

    it('el portero abre si declara apertura remota', async () => {
      const { proveedor } = caso.montar();
      const capacidades = await proveedor.capacidadesDe(PORTERO);
      expect(soporta(capacidades, 'aperturaRemota')).toBe(true);
      expect((await proveedor.abrir(PORTERO, 'operador-1')).aceptado).toBe(true);
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

  describe('bloqueo de acceso · H-3, por capacidad (ETAPA 15-E)', () => {
    it('la barrera declara bloqueo y la orden se ACEPTA, con latencia medida', async () => {
      const { proveedor } = caso.montar();
      expect(soporta(await proveedor.capacidadesDe(BARRERA), 'bloqueoDeAcceso')).toBe(true);
      const resultado = await proveedor.fijarBloqueo(BARRERA, true);
      expect(resultado.estado).toBe('aceptada');
      expect(resultado.latenciaMs).toBeGreaterThanOrEqual(0);
    });

    it('bloquear y desbloquear son la misma capacidad en los dos sentidos', async () => {
      const { proveedor } = caso.montar();
      await proveedor.fijarBloqueo(BARRERA, true);
      expect((await proveedor.fijarBloqueo(BARRERA, false)).estado).toBe('aceptada');
    });

    it('quien NO declara bloqueo se niega con CapacidadNoSoportada, nunca «aceptada»', async () => {
      // La misma frase para los tres: si la capacidad es sí, resuelve; si no,
      // el error nombra la capacidad. Un simulado completo declara sí en todo
      // y por eso la aserción se escribe contra lo que el equipo declara.
      const { proveedor } = caso.montar();
      const capacidades = await proveedor.capacidadesDe(PORTERO);
      if (soporta(capacidades, 'bloqueoDeAcceso')) {
        expect((await proveedor.fijarBloqueo(PORTERO, true)).estado).toBe('aceptada');
        return;
      }
      const error = await proveedor
        .fijarBloqueo(PORTERO, true)
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CapacidadNoSoportada);
      expect((error as CapacidadNoSoportada).capacidad).toBe('bloqueoDeAcceso');
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

    it('sincroniza una plantilla contra una terminal CON biblioteca', async () => {
      const { proveedor } = caso.montar();
      expect(soporta(await proveedor.capacidadesDe(TERMINAL), 'bibliotecaDeRostros')).toBe(true);
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

  describe('verificación remota · A2, por capacidad (ETAPA 15-E)', () => {
    it('una terminal que declara esperar el veredicto recibe la respuesta, con latencia', async () => {
      const { proveedor } = caso.montar();
      expect(soporta(await proveedor.capacidadesDe(TERMINAL), 'verificacionRemota')).toBe(true);
      const r = await proveedor.responderVerificacionRemota(TERMINAL, {
        serie: 17,
        permitido: true,
        motivo: 'autorización vigente',
      });
      expect(r.aceptado).toBe(true);
      expect(r.latenciaMs).toBeGreaterThanOrEqual(0);
    });

    it('una negación también viaja al equipo: es la terminal la que muestra el motivo', async () => {
      const { proveedor } = caso.montar();
      const r = await proveedor.responderVerificacionRemota(TERMINAL, {
        serie: 18,
        permitido: false,
        motivo: 'SIN_CONSENTIMIENTO',
      });
      expect(r.aceptado).toBe(true);
    });

    it('quien no declara verificación remota no tiene a quién contestar: CapacidadNoSoportada', async () => {
      const { proveedor } = caso.montar();
      const capacidades = await proveedor.capacidadesDe(BARRERA);
      if (soporta(capacidades, 'verificacionRemota')) {
        // El simulado completo declara sí en todo; la aserción va por lo declarado.
        expect(
          (
            await proveedor.responderVerificacionRemota(BARRERA, {
              serie: null,
              permitido: false,
              motivo: 'x',
            })
          ).aceptado,
        ).toBe(true);
        return;
      }
      const error = await proveedor
        .responderVerificacionRemota(BARRERA, { serie: null, permitido: false, motivo: 'x' })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CapacidadNoSoportada);
      expect((error as CapacidadNoSoportada).capacidad).toBe('verificacionRemota');
    });
  });

  describe('escucha de lo que el equipo emite · A4, por capacidad (ETAPA 15-E)', () => {
    it('el videoportero se escucha, o dice por qué no; y detener es idempotente', async () => {
      const { proveedor } = caso.montar();
      const escucha = await proveedor.escuchar(PORTERO);
      expect(['escucha', 'suscripcion', 'ninguna']).toContain(escucha.transporte);
      expect(escucha.detalle).not.toBe('');
      // Pedirla dos veces no abre dos flujos: es la misma.
      expect((await proveedor.escuchar(PORTERO)).transporte).toBe(escucha.transporte);
      escucha.detener();
      escucha.detener();
    });

    it('un equipo desconocido no se escucha: rechaza', async () => {
      const { proveedor } = caso.montar();
      await expect(proveedor.escuchar(DESCONOCIDO)).rejects.toThrow();
    });

    it('la cámara no se escucha por un segundo camino: `ninguna`, o rechazo por capacidad', async () => {
      const { proveedor } = caso.montar();
      const resultado = await proveedor.escuchar(BARRERA).catch((e: unknown) => e);
      expect(
        resultado instanceof Error ||
          (resultado as { transporte: string }).transporte === 'ninguna',
      ).toBe(true);
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
      // reparte el dominio, igual en los tres proveedores.
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

    it('con sesión abierta, el audio enviado vuelve por el canal (eco del banco)', async () => {
      const { proveedor } = caso.montar();
      await proveedor.abrirSesion(PORTERO, 'operador-1');
      await proveedor.enviarAudio(new Uint8Array([7, 8, 9]));
      const recibido: number[] = [];
      for await (const trozo of proveedor.recibirAudio()) recibido.push(...trozo);
      expect(recibido.length).toBeGreaterThan(0);
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
 * LOS MUNDOS ADVERSOS · la mitad del contrato que la 15-D añade (§9.2)
 *
 * Cada aserción se escribe contra la CAPACIDAD o contra la CLASE DE ERROR, y
 * es la misma para todo proveedor que sepa materializar ese mundo. Aquí no hay
 * `if (esHikvision)`: hay «los casos que declaran esta adversidad», que es un
 * dato del caso, no una rama de la aserción.
 */
const casosCon = (adversidad: Adversidad): readonly CasoDeContrato[] =>
  CASOS.filter((c) => c.adversidades.has(adversidad));

describe('cada adversidad la ejercitan al menos DOS proveedores', () => {
  it.each(ADVERSIDADES)('%s', (adversidad) => {
    // Una adversidad probada por un solo adaptador no es contrato: es una
    // prueba de ese adaptador disfrazada.
    expect(casosCon(adversidad).length).toBeGreaterThanOrEqual(2);
  });
});

describe.each(casosCon('terminalSinBiblioteca'))(
  'terminal SIN biblioteca de rostros · $nombre',
  (caso) => {
    it('sincronizar se niega con CapacidadNoSoportada, nombrando la capacidad', async () => {
      const { proveedor } = caso.montar({ terminalSinBiblioteca: true });
      expect(estadoDe(await proveedor.capacidadesDe(TERMINAL), 'bibliotecaDeRostros')).toBe('no');
      const error = await proveedor
        .sincronizar(TERMINAL, 'p-1', new Uint8Array([1]))
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CapacidadNoSoportada);
      expect((error as CapacidadNoSoportada).capacidad).toBe('bibliotecaDeRostros');
      expect((error as CapacidadNoSoportada).porDesconocida).toBe(false);
    });
  },
);

describe.each(casosCon('terminalSinCapacidadesConocidas'))(
  'terminal cuyas capacidades NADIE consultó · $nombre',
  (caso) => {
    it('DESCONOCIDA no es SÍ: se niega, y el motivo dice que fue por no saber', async () => {
      const { proveedor } = caso.montar({ terminalSinCapacidadesConocidas: true });
      const error = await proveedor
        .sincronizar(TERMINAL, 'p-1', new Uint8Array([1]))
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CapacidadNoSoportada);
      expect((error as CapacidadNoSoportada).porDesconocida).toBe(true);
      expect((error as Error).message).toMatch(/no ha declarado/);
    });
  },
);

describe.each(casosCon('bibliotecaLlena'))('biblioteca de rostros LLENA · $nombre', (caso) => {
  it('sincronizar falla con BibliotecaLlena, no con un error opaco', async () => {
    const { proveedor } = caso.montar({ bibliotecaLlena: true });
    await expect(
      proveedor.sincronizar(TERMINAL, 'p-1', new Uint8Array([1])),
    ).rejects.toBeInstanceOf(BibliotecaLlena);
  });
});

describe.each(casosCon('porteroSinAperturaRemota'))(
  'portero SIN apertura remota · $nombre',
  (caso) => {
    it('abrir se niega con CapacidadNoSoportada(aperturaRemota)', async () => {
      const { proveedor } = caso.montar({ porteroSinAperturaRemota: true });
      expect(estadoDe(await proveedor.capacidadesDe(PORTERO), 'aperturaRemota')).toBe('no');
      const error = await proveedor
        .abrir(PORTERO, 'operador-1')
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CapacidadNoSoportada);
      expect((error as CapacidadNoSoportada).capacidad).toBe('aperturaRemota');
    });
  },
);

describe.each(casosCon('porteroSinAudio'))('portero SIN audio bidireccional · $nombre', (caso) => {
  it('abrir sesión se niega con CapacidadNoSoportada(audioBidireccional)', async () => {
    const { proveedor } = caso.montar({ porteroSinAudio: true });
    const error = await proveedor
      .abrirSesion(PORTERO, 'operador-1')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CapacidadNoSoportada);
    expect((error as CapacidadNoSoportada).capacidad).toBe('audioBidireccional');
  });
});

describe.each(casosCon('porteroOcupado'))('portero OCUPADO · $nombre', (caso) => {
  it('abrir falla con EquipoOcupado, que es reintentable y FALLO_TECNICO', async () => {
    const { proveedor } = caso.montar({ porteroOcupado: true });
    const error = await proveedor
      .abrir(PORTERO, 'operador-1')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EquipoOcupado);
    expect((error as EquipoOcupado).reintentable).toBe(true);
  });
});

describe.each(casosCon('porteroAveriado'))('portero AVERIADO · $nombre', (caso) => {
  it('abrir falla con EquipoAveriado, que NO se reintenta', async () => {
    const { proveedor } = caso.montar({ porteroAveriado: true });
    const error = await proveedor
      .abrir(PORTERO, 'operador-1')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EquipoAveriado);
    expect((error as EquipoAveriado).reintentable).toBe(false);
  });
});

describe.each(casosCon('porteroReinicioNecesario'))(
  'portero que exige REINICIO · $nombre',
  (caso) => {
    it('abrir falla con ReinicioNecesario: lo hace una persona, no un reintento', async () => {
      const { proveedor } = caso.montar({ porteroReinicioNecesario: true });
      await expect(proveedor.abrir(PORTERO, 'operador-1')).rejects.toBeInstanceOf(
        ReinicioNecesario,
      );
    });
  },
);

describe.each(casosCon('porteroCredencialRechazada'))(
  'portero que RECHAZA la credencial · $nombre',
  (caso) => {
    it('abrir falla con CredencialRechazada y NO es reintentable: bloquea la cuenta', async () => {
      const { proveedor } = caso.montar({ porteroCredencialRechazada: true });
      const error = await proveedor
        .abrir(PORTERO, 'operador-1')
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CredencialRechazada);
      expect((error as CredencialRechazada).reintentable).toBe(false);
    });

    it('y el estado queda DEGRADADO, no fuera de línea: está vivo y mal configurado', async () => {
      const { proveedor } = caso.montar({ porteroCredencialRechazada: true });
      expect(await proveedor.estado(PORTERO)).toBe('degradado');
    });
  },
);

describe.each(casosCon('porteroInalcanzable'))('portero INALCANZABLE · $nombre', (caso) => {
  it('abrir NO lanza: devuelve no aceptado, que es lo que el puerto del dominio dice', async () => {
    const { proveedor } = caso.montar({ porteroInalcanzable: true });
    const resultado = await proveedor.abrir(PORTERO, 'operador-1');
    expect(resultado.aceptado).toBe(false);
  });

  it('y el estado es FUERA DE LÍNEA: se resuelve llamando al técnico', async () => {
    const { proveedor } = caso.montar({ porteroInalcanzable: true });
    expect(await proveedor.estado(PORTERO)).toBe('fuera_de_linea');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Y LA COMPROBACIÓN QUE NO SE PUEDE PARAMETRIZAR, porque compara entre sí
 *
 * Que cada uno cumpla su contrato por separado no basta: hay que ver que el
 * mismo estímulo produce el mismo resultado observable en todos. Es lo que
 * distingue «tres implementaciones correctas» de «tres implementaciones
 * intercambiables», que es lo que ADR-03 promete.
 */
describe('los tres proveedores producen la MISMA lectura para el mismo estímulo', () => {
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
    const lecturas = await Promise.all(CASOS.map(leerCon));
    for (const lectura of lecturas) {
      expect(lectura?.placa).toBe('ABC123');
      expect(lectura?.dispositivoId).toBe(BARRERA);
      // No se compara el valor exacto de confianza: el simulado la genera con
      // semilla y el otro la lee del sobre. Lo que TIENE que coincidir es la
      // escala, porque el umbral del dominio compara contra ella.
      expect(lectura?.confianza).toBeGreaterThan(0);
      expect(lectura?.confianza).toBeLessThanOrEqual(1);
    }
  });
});
