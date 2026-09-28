import { describe, expect, it } from 'vitest';
import { Vigencia } from '@ncr/domain-core';
import { TerminalFacial } from './terminal-facial';
import { horaLocalSinDesfase, personaEnElEquipo, zonaValida } from './persona-en-el-equipo';
import { FotoNoAdmitida, exigirFotoAdmisible, inspeccionarFoto } from './foto-del-rostro';
import { identificadorEnElEquipo } from './identificador-en-el-equipo';
import { motivoLegible } from '../nucleo/motivo-legible';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';
import { negacionesLocalesPor, personasPor } from '../simulacion/personas-simuladas';
import {
  FlujoEnVivo,
  desenlacesDeVerificacionPor,
} from '../simulacion/verificacion-remota-simulada';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';

/**
 * ETAPA 15-L · A2 · la persona con su vigencia, en hora local de la
 * copropiedad, y la foto mirada antes de subirla. Contra el equipo simulado,
 * que desde la 15-L recuerda a sus personas y decide en local.
 */
const vigencia = (desde: string, hasta: string): Vigencia => {
  const r = Vigencia.crear(new Date(desde), new Date(hasta));
  if (!r.ok) throw new Error(r.error.detalle);
  return r.valor;
};
const VISITA = vigencia('2026-09-27T14:00:00Z', '2026-09-27T18:00:00Z'); // 09:00–13:00 en Bogotá
const PLANTILLA = '5e2b7c1a-0000-4000-8000-0000000000a2';
const EN_EL_EQUIPO = identificadorEnElEquipo(PLANTILLA);

describe('la hora que se escribe en el equipo', () => {
  it('es la de pared en Bogotá, sin desfase ni zona', () => {
    expect(horaLocalSinDesfase(new Date('2026-09-27T15:00:00Z'), 'America/Bogota')).toBe(
      '2026-09-27T10:00:00',
    );
  });

  it('respeta la zona configurada', () => {
    expect(horaLocalSinDesfase(new Date('2026-09-27T15:00:00Z'), 'UTC')).toBe(
      '2026-09-27T15:00:00',
    );
  });

  it('se acota al rango del equipo (1970–2037)', () => {
    expect(horaLocalSinDesfase(new Date('2040-01-01T00:00:00Z'), 'UTC')).toBe(
      '2037-12-31T23:59:59',
    );
    expect(horaLocalSinDesfase(new Date('1960-01-01T00:00:00Z'), 'UTC')).toBe(
      '1970-01-01T00:00:00',
    );
  });

  it('una zona mal escrita se detecta antes de llegar a la puerta', () => {
    expect(zonaValida('America/Bogota')).toBe(true);
    expect(zonaValida('America/Bogotá')).toBe(false);
  });
});

describe('el registro UserInfo', () => {
  it('SIN vigencia y sin puerta es el de antes de la 15-L, byte a byte', () => {
    expect(JSON.stringify({ UserInfo: personaEnElEquipo('p7', undefined, null) })).toBe(
      '{"UserInfo":{"employeeNo":"p7","name":"p7","userType":"normal","Valid":{"enable":false}}}',
    );
  });

  it('CON vigencia: visitante, habilitada, en hora local, y el fin es el último segundo dentro', () => {
    const p = personaEnElEquipo('p7', VISITA, null);
    expect(p.userType).toBe('visitor');
    expect(p.Valid).toEqual({
      enable: true,
      beginTime: '2026-09-27T09:00:00',
      // La vigencia es [desde, hasta): 13:00:00 ya está fuera.
      endTime: '2026-09-27T12:59:59',
      timeType: 'local',
    });
  });

  it('una vigencia de menos de un segundo no termina antes de empezar', () => {
    const corta = vigencia('2026-09-27T14:00:00.200Z', '2026-09-27T14:00:00.700Z');
    const p = personaEnElEquipo('p7', corta, null);
    expect(p.Valid.enable && p.Valid.endTime).toBe('2026-09-27T09:00:00');
  });

  it('con puerta declarada, su permiso y su plantilla horaria (configurable)', () => {
    expect(personaEnElEquipo('p7', undefined, 2)).toMatchObject({
      doorRight: '2',
      RightPlan: [{ doorNo: 2, planTemplateNo: '1' }],
    });
    expect(
      personaEnElEquipo('p7', VISITA, 1, { planDeHorario: '65535', zonaHoraria: 'UTC' }),
    ).toMatchObject({
      RightPlan: [{ doorNo: 1, planTemplateNo: '65535' }],
      Valid: { beginTime: '2026-09-27T14:00:00' },
    });
  });
});

const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

/** Terminal contra el simulado, guardando lo que se envió al alta de persona. */
const montar = (destino: string, numeroDePuerta: number | null = null, flujo?: FlujoEnVivo) => {
  const simulado = equipoSimulado({
    familia: 'terminal',
    ...CREDENCIAL,
    destino,
    ...(flujo === undefined ? {} : { enVivo: flujo }),
  });
  const altas: string[] = [];
  const peticion = (async (url: string | URL, opciones?: RequestInit) => {
    if (String(url).includes('UserInfo/') && opciones?.headers !== undefined) {
      const autorizada = (opciones.headers as Record<string, string>)['authorization'];
      if (autorizada !== undefined) altas.push(String(opciones.body));
    }
    return simulado(url, opciones);
  }) as typeof fetch;
  const conexion = {
    host: destino,
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    peticion,
  } as const;
  const terminal = new TerminalFacial({
    ...conexion,
    modo: 'reporta_y_espera',
    numeroDePuerta,
  });
  return { terminal, altas, conexion };
};

describe('A2 contra el equipo simulado', () => {
  it('sin el parámetro, el alta que recibe el equipo NO cambia', async () => {
    const { terminal, altas } = montar('203.0.113.51');
    await terminal.sincronizar('t', PLANTILLA, jpegConMedidas());
    expect(altas).toEqual([
      JSON.stringify({
        UserInfo: {
          employeeNo: EN_EL_EQUIPO,
          name: EN_EL_EQUIPO,
          userType: 'normal',
          Valid: { enable: false },
        },
      }),
    ]);
    expect(personasPor.get('203.0.113.51')?.get(EN_EL_EQUIPO)).toEqual({
      tipo: 'normal',
      desde: null,
      hasta: null,
      puertas: [],
    });
  });

  it('con la vigencia, el equipo guarda al visitante con su intervalo y su puerta', async () => {
    const { terminal } = montar('203.0.113.52', 1);
    await terminal.sincronizar('t', PLANTILLA, jpegConMedidas(), VISITA);
    expect(personasPor.get('203.0.113.52')?.get(EN_EL_EQUIPO)).toEqual({
      tipo: 'visitor',
      desde: '2026-09-27T09:00:00',
      hasta: '2026-09-27T12:59:59',
      puertas: [1],
    });
  });

  it('volver a sincronizar con otra vigencia la ACTUALIZA (alta repetida → modificar)', async () => {
    const { terminal } = montar('203.0.113.53', 1);
    await terminal.sincronizar('t', PLANTILLA, jpegConMedidas(), VISITA);
    const otra = vigencia('2026-09-28T14:00:00Z', '2026-09-28T16:00:00Z');
    await terminal.sincronizar('t', PLANTILLA, jpegConMedidas(), otra);
    expect(personasPor.get('203.0.113.53')?.get(EN_EL_EQUIPO)?.hasta).toBe('2026-09-28T10:59:59');
  });

  it('el equipo rechaza una hora local CON desfase y un rostro sin persona', async () => {
    const { conexion } = montar('203.0.113.54');
    const cliente = new ClienteDeEquipo(conexion);
    const alta = rutaPara('dar de alta la persona a la que pertenece la plantilla', 'terminal');
    const conDesfase = await cliente.pedir(alta.metodo, alta.ruta, {
      tipo: 'application/json',
      contenido: JSON.stringify({
        UserInfo: {
          employeeNo: 'x1',
          userType: 'visitor',
          Valid: {
            enable: true,
            beginTime: '2026-09-27T09:00:00-05:00',
            endTime: '2026-09-27T12:00:00-05:00',
            timeType: 'local',
          },
        },
      }),
    });
    expect(conDesfase.estado).toBe(400);

    const carga = rutaPara('cargar la plantilla facial', 'terminal');
    const separador = '----x';
    const sinPersona = await cliente.pedir(carga.metodo, carga.ruta, {
      tipo: `multipart/form-data; boundary=${separador}`,
      contenido: Buffer.from(
        `--${separador}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\n\r\n` +
          '{"faceLibType":"blackFD","FDID":"1","FPID":"nadie"}\r\n' +
          `--${separador}\r\nContent-Disposition: form-data; name="img"; filename="facePic.jpg"\r\n\r\n` +
          `x\r\n--${separador}--\r\n`,
      ),
    });
    expect(sinPersona.estado).toBe(400);
    expect(sinPersona.cuerpo).toMatch(/employeeNoNotExist/);
  });
});

describe('el propio equipo caduca la credencial, aunque la supresión no llegue', () => {
  const pasa = async (destino: string, hora: string, serie: number) => {
    const flujo = new FlujoEnVivo();
    const { terminal, conexion } = montar(destino, 1, flujo);
    await terminal.sincronizar('t', PLANTILLA, jpegConMedidas(), VISITA);
    const ruta = rutaPara('escuchar los eventos que el equipo emite', 'terminal');
    const control = new AbortController();
    const abierto = await new ClienteDeEquipo(conexion).abrirFlujoDeEventos(
      ruta.ruta,
      control.signal,
    );
    flujo.emitir({
      eventType: 'AccessControllerEvent',
      dateTime: hora,
      AccessControllerEvent: {
        majorEventType: 5,
        subEventType: 75,
        employeeNoString: EN_EL_EQUIPO,
        serialNo: serie,
        remoteCheck: true,
      },
    });
    const { value } = await abierto.trozos[Symbol.asyncIterator]().next();
    control.abort();
    const emitido = JSON.parse(new TextDecoder().decode(value as Uint8Array)) as {
      AccessControllerEvent: Record<string, unknown>;
    };
    await terminal.responderVerificacion('t', { serie, permitido: true, motivo: 'permitido' });
    return { emitido, desenlace: desenlacesDeVerificacionPor.get(destino)?.at(-1)?.desenlace };
  };

  it('dentro de la vigencia pregunta, y con el «sí» de la plataforma abre', async () => {
    const r = await pasa('203.0.113.55', '2026-09-27T10:30:00-05:00', 31);
    expect(r.emitido.AccessControllerEvent['remoteCheck']).toBe(true);
    expect(r.desenlace).toBe('abrio');
  });

  it('la hora del evento se lee en la zona del equipo, venga con desfase o en UTC', async () => {
    // 17:59:59Z es 12:59:59 en Bogotá: el último segundo dentro.
    const r = await pasa('203.0.113.58', '2026-09-27T17:59:59Z', 33);
    expect(r.emitido.AccessControllerEvent['remoteCheck']).toBe(true);
  });

  it('pasada la vigencia NIEGA en local: no pregunta, y ni un «sí» tardío abre', async () => {
    const r = await pasa('203.0.113.56', '2026-09-27T13:00:00-05:00', 32);
    expect(r.emitido.AccessControllerEvent['remoteCheck']).toBeUndefined();
    expect(r.emitido.AccessControllerEvent['subEventType']).toBe(76);
    expect(negacionesLocalesPor.get('203.0.113.56')).toEqual([`${EN_EL_EQUIPO}:fuera_de_vigencia`]);
    expect(r.desenlace).toBe('serie_desconocida');
  });
});

describe('la foto, mirada ANTES de subirla', () => {
  it('lee el formato y las medidas de JPEG y PNG por su cabecera', () => {
    expect(inspeccionarFoto(jpegConMedidas(800, 600))).toEqual({
      formato: 'jpeg',
      ancho: 800,
      alto: 600,
    });
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 1, 0, 0, 0, 0, 200], 16);
    expect(inspeccionarFoto(png)).toEqual({ formato: 'png', ancho: 256, alto: 200 });
    expect(inspeccionarFoto(new Uint8Array([1, 2, 3])).formato).toBeNull();
  });

  it.each([
    ['lo que no es una imagen', new Uint8Array([1, 2, 3]), /no es una imagen/],
    ['una foto que pesa de más', jpegConMedidas(640, 480, 210 * 1024), /pesa 211 KB .* 200 KB/],
    ['una foto de lado mayor excesivo', jpegConMedidas(2000, 1500), /2000×1500 px .* 1024 px/],
    ['un JPEG sin cuadro legible', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), /medidas/],
  ])('%s: se dice por qué, sin tocar el equipo', async (_caso, foto, motivo) => {
    let peticiones = 0;
    const terminal = new TerminalFacial({
      host: '203.0.113.57',
      ...CREDENCIAL,
      modo: 'reporta_y_espera',
      peticion: (async () => {
        peticiones += 1;
        return new Response('');
      }) as typeof fetch,
    });
    const error = await terminal.sincronizar('t', PLANTILLA, foto).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FotoNoAdmitida);
    expect(motivoLegible(error)).toMatch(motivo);
    expect(peticiones).toBe(0);
  });

  it('los límites salen de la configuración', () => {
    const grande = jpegConMedidas(1600, 1200);
    expect(() => exigirFotoAdmisible(grande)).toThrow(FotoNoAdmitida);
    expect(exigirFotoAdmisible(grande, { bytesMaximos: 500_000, ladoMaximo: 1600 }).ancho).toBe(
      1600,
    );
  });
});
