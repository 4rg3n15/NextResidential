import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bibliotecaDesde,
  canalDeAudioUtilizable,
  canalesDeAudioDesde,
  capacidadesDesdeDeviceCap,
  descubrirCapacidades,
  descubrirSinLanzar,
  verificacionRemotaDesde,
} from './capacidades-hikvision';
import { ClienteDeEquipo } from '../equipo/cliente';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { CredencialRechazada } from '../nucleo/errores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS LECTORES, PROBADOS CONTRA LOS VOLCADOS REALES
 *
 * `docs/insumos/hikvision/hik-*.xml` son capturas de los dos equipos del
 * proyecto (23/09/2026, con serie y sal redactadas). Un lector que pasara
 * contra un XML escrito «como nos conviene» probaría que dos ficheros nuestros
 * se entienden entre sí; contra el volcado, prueba que lee lo que el aparato
 * dice. Es la única parte de este paquete que se puede llamar «leída de
 * hardware real» — leída, no ejecutada.
 */
const INSUMOS = resolve(__dirname, '../../../../docs/insumos/hikvision');
const leer = (nombre: string): string => readFileSync(resolve(INSUMOS, nombre), 'utf8');

describe('capacidades del sistema · contra el VOLCADO REAL del videoportero DS-KD9633', () => {
  const c = capacidadesDesdeDeviceCap(leer('hik-videoportero-capabilities.xml'));

  it('declara apertura remota', () => {
    expect(c.aperturaRemota).toBe('si');
  });

  it('y declara que NO señaliza llamadas: lo que obliga a decidir por capacidades', () => {
    expect(c.senalizacionDeLlamada).toBe('no');
  });

  it('admite suscripción de eventos y tiene entrada y salida de audio', () => {
    expect(c.suscripcionDeEventos).toBe('si');
    expect(c.audioBidireccional?.estado).toBe('si');
  });

  it('no dice nada de matrículas: queda DESCONOCIDA, no `no`', () => {
    expect(c.reconocimientoDePlacas).toBe('desconocida');
  });
});

describe('capacidades del sistema · contra el VOLCADO REAL de la cámara', () => {
  const c = capacidadesDesdeDeviceCap(leer('hik-camara-capabilities.xml'));

  it('reconoce matrículas y admite suscripción', () => {
    expect(c.reconocimientoDePlacas).toBe('si');
    expect(c.suscripcionDeEventos).toBe('si');
  });

  it('no declara intercom ni audio: DESCONOCIDA, que el consumidor niega', () => {
    expect(c.aperturaRemota).toBe('desconocida');
    expect(c.audioBidireccional?.estado).toBe('desconocida');
  });
});

describe('capacidades del sistema · lo que un documento raro produce', () => {
  it('un audio con cero entradas es `no`, y un valor que no es booleano es DESCONOCIDA', () => {
    const c = capacidadesDesdeDeviceCap(
      '<DeviceCap><SysCap><AudioCap><audioInputNums>0</audioInputNums>' +
        '<audioOutputNums>1</audioOutputNums></AudioCap></SysCap>' +
        '<VideoIntercomCap><isSupportRemoteOpenDoor>quizá</isSupportRemoteOpenDoor>' +
        '</VideoIntercomCap></DeviceCap>',
    );
    expect(c.audioBidireccional?.estado).toBe('no');
    expect(c.aperturaRemota).toBe('desconocida');
  });
});

describe('los canales de audio · D4, el canal se LEE', () => {
  const XML =
    '<TwoWayAudioChannelList><TwoWayAudioChannel><id>1</id><enabled>false</enabled>' +
    '<audioCompressionType>G.711ulaw</audioCompressionType></TwoWayAudioChannel>' +
    '<TwoWayAudioChannel><id>2</id><enabled>true</enabled>' +
    '<audioCompressionType>G.711alaw</audioCompressionType></TwoWayAudioChannel>' +
    '<TwoWayAudioChannel><id>3</id><audioCompressionType>G.726</audioCompressionType>' +
    '</TwoWayAudioChannel><TwoWayAudioChannel><id>4</id><enabled>true</enabled>' +
    '<audioCompressionType>AAC</audioCompressionType></TwoWayAudioChannel>' +
    '<TwoWayAudioChannel><id>5</id><enabled>true</enabled>' +
    '<audioCompressionType>MP2L2</audioCompressionType></TwoWayAudioChannel>' +
    '<TwoWayAudioChannel><id>6</id><enabled>true</enabled></TwoWayAudioChannel>' +
    '</TwoWayAudioChannelList>';

  it('lee todos los canales con su códec traducido a nombre neutro', () => {
    const canales = canalesDeAudioDesde(XML);
    expect(canales.map((c) => c.formato)).toEqual(['g711u', 'g711a', 'g726', 'aac', 'mp2l2', null]);
    expect(canales[2]?.habilitado).toBeNull();
  });

  it('el utilizable es el PRIMERO habilitado, no el 1', () => {
    expect(canalDeAudioUtilizable(canalesDeAudioDesde(XML))?.id).toBe(2);
  });

  it('sin ninguno habilitado no hay canal utilizable', () => {
    expect(canalDeAudioUtilizable(canalesDeAudioDesde('<TwoWayAudioChannelList/>'))).toBeNull();
  });
});

describe('verificación remota de la terminal · [SUPUESTO] S-35', () => {
  it('true → si · false → no · ausente o ilegible → desconocida', () => {
    expect(verificacionRemotaDesde('{"AcsCfg":{"remoteCheck":true}}')).toBe('si');
    expect(verificacionRemotaDesde('{"remoteCheck":false}')).toBe('no');
    expect(verificacionRemotaDesde('{"AcsCfg":{}}')).toBe('desconocida');
    expect(verificacionRemotaDesde('no es json')).toBe('desconocida');
    expect(verificacionRemotaDesde('42')).toBe('desconocida');
  });
});

describe('la biblioteca de rostros · máximo y recuento', () => {
  it('lee el máximo y el recuento, con o sin la forma `@max`', () => {
    expect(
      bibliotecaDesde(
        '{"FDLibCap":{"maxFDRecordNum":{"@max":300}}}',
        '{"FDRecordCount":{"totalNum":7}}',
      ),
    ).toEqual({ estado: 'si', maximo: 300, almacenadas: 7 });
    expect(bibliotecaDesde('{"FDLibCap":{"maxFDRecordNum":50}}', null)).toEqual({
      estado: 'si',
      maximo: 50,
      almacenadas: null,
    });
  });

  it('sin ninguna de las dos respuestas queda DESCONOCIDA', () => {
    expect(bibliotecaDesde(null, null).estado).toBe('desconocida');
  });

  it('un JSON roto o de otra forma no inventa cifras', () => {
    expect(bibliotecaDesde('{', '"texto"')).toEqual({
      estado: 'si',
      maximo: null,
      almacenadas: null,
    });
    expect(
      bibliotecaDesde('{"FDLibCap":{"maxFDRecordNum":{"@max":"x"}}}', '{"FDRecordCount":5}'),
    ).toEqual({
      estado: 'si',
      maximo: null,
      almacenadas: null,
    });
  });
});

describe('descubrir contra el equipo simulado, familia por familia', () => {
  const CRED = { usuario: 'servicio', clave: 'k' } as const;
  const cliente = (guion: Parameters<typeof equipoSimulado>[0]): ClienteDeEquipo =>
    new ClienteDeEquipo({ host: 'x.invalid', ...CRED, peticion: equipoSimulado(guion) });

  it('videoportero: apertura, audio con canal y códec, sin llamada', async () => {
    const c = await descubrirCapacidades({
      cliente: cliente({ familia: 'videoportero', ...CRED }),
      familia: 'videoportero',
    });
    expect(c.origen).toBe('descubiertas');
    expect(c.aperturaRemota).toBe('si');
    expect(c.audioBidireccional).toEqual({ estado: 'si', canal: 1, formato: 'g711u' });
    expect(c.senalizacionDeLlamada).toBe('no');
  });

  it('videoportero con el canal DESHABILITADO —como el real—: audio `no` y sin canal', async () => {
    const c = await descubrirCapacidades({
      cliente: cliente({
        familia: 'videoportero',
        ...CRED,
        canalesDeAudio: [{ id: 1, habilitado: false }],
      }),
      familia: 'videoportero',
    });
    expect(c.audioBidireccional.estado).toBe('no');
    expect(c.audioBidireccional.canal).toBeNull();
    expect(c.audioBidireccional.formato).toBe('g711u');
  });

  it('terminal: verificación remota, biblioteca con máximo, personas y puerta', async () => {
    const c = await descubrirCapacidades({
      cliente: cliente({ familia: 'terminal', ...CRED, bibliotecaMaximo: 120 }),
      familia: 'terminal',
    });
    expect(c.verificacionRemota).toBe('si');
    expect(c.bibliotecaDeRostros).toEqual({ estado: 'si', maximo: 120, almacenadas: 0 });
    expect(c.gestionDePersonas).toBe('si');
    expect(c.aperturaRemota).toBe('si');
  });

  it('terminal cuya puerta NO admite `open`: apertura remota `no`', async () => {
    const c = await descubrirCapacidades({
      cliente: cliente({ familia: 'terminal', ...CRED, ordenesDePuerta: ['close'] }),
      familia: 'terminal',
    });
    expect(c.aperturaRemota).toBe('no');
  });

  it('cámara: placas, estado de barrera y apertura por la ruta verificada', async () => {
    const c = await descubrirCapacidades({
      cliente: cliente({ familia: 'camara', ...CRED }),
      familia: 'camara',
    });
    expect(c.reconocimientoDePlacas).toBe('si');
    expect(c.estadoDeBarrera).toBe('si');
    expect(c.aperturaRemota).toBe('si');
  });

  it('cámara que no contesta a la capacidad de barrera: DESCONOCIDA', async () => {
    const c = await descubrirCapacidades({
      cliente: cliente({
        familia: 'camara',
        ...CRED,
        sinSoporte: ['leer si este modelo reporta el estado de la barrera'],
      }),
      familia: 'camara',
    });
    expect(c.estadoDeBarrera).toBe('desconocida');
  });

  it('un equipo que no contesta a NADA de capacidades queda todo desconocido, con origen', async () => {
    const c = await descubrirCapacidades({
      cliente: cliente({ familia: 'terminal', ...CRED, sinCapacidades: true }),
      familia: 'terminal',
    });
    expect(c.origen).toBe('descubiertas');
    expect(c.bibliotecaDeRostros.estado).toBe('desconocida');
    expect(c.verificacionRemota).toBe('desconocida');
  });

  it('credencial rechazada LANZA: no es «no declara», es «no me dejó preguntar»', async () => {
    await expect(
      descubrirCapacidades({
        cliente: cliente({ familia: 'terminal', ...CRED, rechazaCredencial: true }),
        familia: 'terminal',
        dispositivoId: 'disp-t',
      }),
    ).rejects.toBeInstanceOf(CredencialRechazada);
  });

  it('inalcanzable: `descubrirSinLanzar` devuelve «sin consultar»; lo demás se propaga', async () => {
    const muerto = new ClienteDeEquipo({
      host: 'x.invalid',
      ...CRED,
      peticion: (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch,
    });
    const c = await descubrirSinLanzar({ cliente: muerto, familia: 'camara' });
    expect(c.origen).toBe('sin_consultar');

    await expect(
      descubrirSinLanzar({
        cliente: cliente({ familia: 'terminal', ...CRED, rechazaCredencial: true }),
        familia: 'terminal',
      }),
    ).rejects.toBeInstanceOf(CredencialRechazada);
  });
});
