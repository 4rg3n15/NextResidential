import { describe, expect, it, vi } from 'vitest';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { exito, fallo, errorDominio, ordenAceptada } from '@ncr/domain-core';
import type { ResultadoDeAccionamiento } from '@ncr/domain-core';
import type { RegistrarAcceso } from '../../eventos';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';
import type { PeticionDeEquipo } from '../../comun/sobre-de-equipo';
import { FuenteDePlacas } from '@ncr/providers';
import { AlarmServerController } from './alarm-server.controller';
import {
  IngestorDeEquipos,
  PRESUPUESTO_DE_EVIDENCIA_MS,
} from '../aplicacion/ingestor-de-publicaciones';

/**
 * LA PRUEBA DEL PRINCIPIO RECTOR, EN UNA FRASE: el relé se acciona **cuando y
 * sólo cuando** el motor de reglas dijo que sí.
 *
 * Se prueba aquí y no por HTTP porque el banco en memoria no tiene padrón: toda
 * decisión sale denegada y el camino del permitido —el que abre una talanquera—
 * no se ejercitaría nunca. Con el caso de uso sustituido por un doble, las dos
 * ramas se recorren enteras y lo que se comprueba es exactamente lo que este
 * controlador decide: **nada**, salvo a quién entrega el hecho y qué hace con
 * la respuesta.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ CAMBIÓ EN LA 15-C, Y POR QUÉ LAS ASERCIONES SON LAS MISMAS
 *
 * El controlador ya no orquesta: acredita, abre el sobre y **publica en el
 * puerto**. La evidencia, el caso de uso y el relé viven en el ingestor, que es
 * el único suscriptor de esa fuente.
 *
 * Las aserciones de abajo **no se han tocado**, y eso es lo que demuestra que
 * el refactor no cambió el comportamiento: el mismo sobre entra por el mismo
 * sitio y produce exactamente las mismas llamadas. Lo único que cambia es el
 * montaje, que ahora cablea la fuente y el ingestor como lo hace el módulo.
 */

const EQUIPO: EquipoDeclarado = {
  copropiedadId: 'cop-1',
  dispositivoId: 'camara-entrada',
  secreto: 'x'.repeat(32),
  origenesPermitidos: ['origen-declarado'],
};

const XML_DE_PLACA =
  '<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert>' +
  '<eventType>ANPR</eventType><licensePlate>ABC123</licensePlate>' +
  '<confidenceLevel>92</confidenceLevel><eventId>ev-1</eventId>' +
  '<alarmDataType>0</alarmDataType></EventNotificationAlert>';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x80, 0xfe, 0xff, 0xd9]);

const sobre = (xml: string, conImagen = true): Buffer =>
  Buffer.concat([
    Buffer.from('--B\r\nContent-Disposition: form-data; name="anpr.xml"\r\n'),
    Buffer.from('Content-Type: text/xml\r\n\r\n'),
    Buffer.from(xml),
    Buffer.from('\r\n'),
    ...(conImagen
      ? [
          Buffer.from('--B\r\nContent-Disposition: form-data; name="pic"\r\n'),
          Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
          JPEG,
          Buffer.from('\r\n'),
        ]
      : []),
    Buffer.from('--B--\r\n'),
  ]);

/**
 * `null` y no `undefined` para «sin acreditar»: pasar `undefined` a un
 * parámetro con valor por omisión lo RELLENA con el valor por omisión, y la
 * prueba del caso sin equipo acababa probando el caso con equipo — en verde.
 */
const peticion = (cuerpo: Buffer, equipo: EquipoDeclarado | null = EQUIPO): PeticionDeEquipo =>
  ({
    headers: { 'content-type': 'multipart/form-data; boundary=B' },
    sobreCrudo: cuerpo,
    ...(equipo === null ? {} : { equipoAcreditado: equipo }),
  }) as unknown as PeticionDeEquipo;

const bitacoraSilenciosa: Bitacora = { registrar: vi.fn() };
const reloj: Reloj = { ahora: () => new Date('2026-09-22T12:00:00Z') };
const ids: GeneradorDeId = { nuevo: () => 'id-fijo' };

interface Montaje {
  readonly controlador: AlarmServerController;
  readonly accionar: ReturnType<typeof vi.fn>;
  readonly guardar: ReturnType<typeof vi.fn>;
  readonly ejecutar: ReturnType<typeof vi.fn>;
}

const montar = (opciones: {
  permitido?: boolean;
  duplicado?: boolean;
  registroFalla?: boolean;
  evidencia?: () => Promise<string>;
  orden?: ResultadoDeAccionamiento;
  bitacora?: Bitacora;
}): Montaje => {
  const ejecutar = vi.fn(async () =>
    opciones.registroFalla === true
      ? fallo(errorDominio('REFERENCIA_INVALIDA', 'referencia externa inadmisible'))
      : exito({
          eventoId: 'ev-guardado',
          claveIdempotencia: 'clave',
          duplicado: opciones.duplicado ?? false,
          permitido: opciones.permitido ?? false,
          alertaId: null,
        }),
  );
  const accionar = vi.fn(async () => opciones.orden ?? ordenAceptada(120));
  const guardar = vi.fn(opciones.evidencia ?? (async () => 'evidencia-1'));

  const almacen: AlmacenEvidencia = { guardar, urlFirmada: async () => 'https://x.invalid' };

  const bitacora = opciones.bitacora ?? bitacoraSilenciosa;
  // El mismo montaje que el módulo desde la 15-E: la fuente es COMPARTIDA y el
  // ingestor se le fija después, no se construye dentro de ella.
  const ingestor = new IngestorDeEquipos(
    { ejecutar } as unknown as RegistrarAcceso,
    { accionar },
    almacen,
    bitacora,
    ids,
    [EQUIPO],
  );
  const fuente = new FuenteDePlacas();
  fuente.fijarIngestor(ingestor);
  const controlador = new AlarmServerController(fuente, bitacora, reloj, ingestor);
  return { controlador, accionar, guardar, ejecutar };
};

describe('el relé se acciona SÓLO si el motor permitió', () => {
  it('permitido: se acciona, y con el dispositivo del equipo acreditado', async () => {
    const { controlador, accionar } = montar({ permitido: true });
    await controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'da-igual');
    // Y atribuida a la identidad de servicio de la ingesta: el proveedor exige
    // un actor (RN-08) y aquí decide el motor, no una persona.
    expect(accionar).toHaveBeenCalledWith('camara-entrada', true, expect.any(String));
  });

  it('DENEGADO: no se acciona nada, y aun así hubo evento (RN-02)', async () => {
    const { controlador, accionar, ejecutar } = montar({ permitido: false });
    const respuesta = await controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x');
    expect(accionar).not.toHaveBeenCalled();
    // La negación se registra igual: es el hecho que un incidente necesita.
    expect(ejecutar).toHaveBeenCalledOnce();
    expect(respuesta).toEqual({ aceptado: true });
  });

  it('DUPLICADO permitido: no se vuelve a accionar', async () => {
    // La cámara reenvía cuando no recibe respuesta a tiempo. Accionar dos veces
    // el mismo hecho abre la talanquera una segunda vez sin nadie delante.
    const { controlador, accionar } = montar({ permitido: true, duplicado: true });
    await controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x');
    expect(accionar).not.toHaveBeenCalled();
  });

  it('el equipo puede rechazar la orden y el evento sigue en pie', async () => {
    const { controlador, accionar } = montar({
      permitido: true,
      orden: { estado: 'inalcanzable', motivo: 'no respondió', latenciaMs: 3000 },
    });
    // No lanza: el evento ya está escrito y es inmutable. Lo que cambia es lo
    // que dice la bitácora, no si hubo acceso registrado.
    await expect(controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x')).resolves.toEqual({
      aceptado: true,
    });
    expect(accionar).toHaveBeenCalledOnce();
  });
});

describe('lo que se entrega al caso de uso', () => {
  it('traduce la lectura a un hecho con la copropiedad del EQUIPO, no del cuerpo', async () => {
    const { controlador, ejecutar } = montar({ permitido: false });
    await controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x');
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({
        copropiedadId: 'cop-1',
        dispositivoId: 'camara-entrada',
        metodo: 'placa',
        placaLeida: 'ABC123',
        confianza: 0.92,
        referenciaExterna: 'ev-1',
        evidenciaId: 'evidencia-1',
      }),
      expect.any(String),
    );
  });

  it('sin confianza declarada entrega 0 y NO 1', async () => {
    // Suponer certeza donde el equipo no la afirma es decidir por él, y anula
    // el umbral de lectura dudosa (CU-01, excepción 3a).
    const sinConfianza = XML_DE_PLACA.replace('<confidenceLevel>92</confidenceLevel>', '');
    const { controlador, ejecutar } = montar({});
    await controlador.publicar(peticion(sobre(sinConfianza)), 'x');
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({ confianza: 0 }),
      expect.any(String),
    );
  });

  it('sin identificador del equipo, la referencia se compone y sigue siendo estable', async () => {
    const sinId = XML_DE_PLACA.replace('<eventId>ev-1</eventId>', '');
    const { controlador, ejecutar } = montar({});
    await controlador.publicar(peticion(sobre(sinId)), 'x');
    const primera = ejecutar.mock.calls[0]?.[0] as { referenciaExterna: string };
    expect(primera.referenciaExterna).toContain('ABC123');

    const otra = montar({});
    await otra.controlador.publicar(peticion(sobre(sinId)), 'x');
    const segunda = otra.ejecutar.mock.calls[0]?.[0] as { referenciaExterna: string };
    // El mismo hecho produce la misma referencia: es lo que hace que el reenvío
    // de la cámara se deduplique en vez de duplicar el acceso (RN-17).
    expect(segunda.referenciaExterna).toBe(primera.referenciaExterna);
  });
});

describe('lo que NO es una lectura de placa', () => {
  it('un evento de otra clase se acepta y se ignora, sin llegar al caso de uso', async () => {
    const otro =
      '<EventNotificationAlert><eventType>IO</eventType>' +
      '<alarmDataType>0</alarmDataType></EventNotificationAlert>';
    const { controlador, ejecutar, accionar } = montar({});
    const respuesta = await controlador.publicar(peticion(sobre(otro)), 'x');
    // Aceptado y no rechazado: un error haría que la cámara reintentara ese
    // mismo aviso para siempre. Lo que hay que decirle es «recibido, no sirve».
    expect(respuesta).toEqual({ aceptado: true, ignorado: true, motivo: 'sin lectura de placa' });
    expect(ejecutar).not.toHaveBeenCalled();
    expect(accionar).not.toHaveBeenCalled();
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * NADA DE ESTO DEVUELVE UN ERROR AL EQUIPO, Y ES UN REQUISITO DEL PROTOCOLO
   *
   * La guía del fabricante: «si el integrador no responde, el dispositivo
   * considerará la notificación perdida y la subirá otra vez». Un `400` no le
   * dice al equipo «esto está mal»: le dice «no te he recibido», y lo reenvía
   * en bucle con el mismo resultado. Lo que se rechaza se rechaza en el
   * registro, no en el código de estado.
   */
  it('un sobre ilegible se ACEPTA y se ignora: un 400 lo haría reenviar en bucle', async () => {
    const { controlador, ejecutar } = montar({});
    const rota = peticion(Buffer.from('esto no es un multipart'));
    await expect(controlador.publicar(rota, 'x')).resolves.toMatchObject({
      aceptado: true,
      ignorado: true,
    });
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('sin equipo acreditado no se sigue adivinando a quién atribuir el evento', async () => {
    const { controlador, ejecutar } = montar({});
    await expect(controlador.publicar(peticion(sobre(XML_DE_PLACA), null), 'x')).resolves.toEqual({
      aceptado: true,
    });
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('un fallo del caso de uso tampoco devuelve error, y NO abre', async () => {
    const { controlador, accionar } = montar({ registroFalla: true });
    await expect(controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x')).resolves.toMatchObject({
      aceptado: true,
      ignorado: true,
    });
    expect(accionar).not.toHaveBeenCalled();
  });

  it('un evento que el equipo marca HISTÓRICO no llega al caso de uso', async () => {
    // El equipo reenvía su historial por este mismo canal. Sin el corte, la
    // portería mostraría accesos de hace días como si ocurrieran ahora, en una
    // tabla append-only que no se puede limpiar.
    const historico = XML_DE_PLACA.replace('<alarmDataType>0<', '<alarmDataType>1<');
    const { controlador, ejecutar, accionar } = montar({ permitido: true });
    const respuesta = await controlador.publicar(peticion(sobre(historico)), 'x');
    expect(respuesta).toMatchObject({ ignorado: true, motivo: 'el equipo lo marcó histórico' });
    expect(ejecutar).not.toHaveBeenCalled();
    expect(accionar).not.toHaveBeenCalled();
  });
});

describe('H-16-1 · los recortes de rostro del sobre', () => {
  const conRostro = (): Buffer =>
    Buffer.concat([
      Buffer.from('--B\r\nContent-Disposition: form-data; name="anpr.xml"\r\n'),
      Buffer.from('Content-Type: text/xml\r\n\r\n'),
      Buffer.from(XML_DE_PLACA),
      Buffer.from('\r\n--B\r\nContent-Disposition: form-data; name="pilotPicture.jpg"\r\n'),
      Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
      JPEG,
      Buffer.from('\r\n--B--\r\n'),
    ]);

  it('no se guardan como evidencia: el almacén no los ve', async () => {
    const { controlador, guardar } = montar({ permitido: true });
    await controlador.publicar(peticion(conRostro()), 'x');
    // La única imagen del sobre era un rostro. El almacén no recibe nada.
    expect(guardar).not.toHaveBeenCalled();
  });

  it('se registran como INCIDENTE, no como curiosidad', async () => {
    // Significa que hay un equipo de la red configurado para enviar datos
    // biométricos por un canal que no pasa por el consentimiento.
    const registrar = vi.fn();
    const { controlador } = montar({ permitido: true, bitacora: { registrar } });
    await controlador.publicar(peticion(conRostro()), 'x');
    const incidente = registrar.mock.calls.find((c) => /H-16-1/.test(String(c[1])));
    expect(incidente, 'no se registró el incidente').toBeDefined();
    expect(incidente?.[0]).toBe('error');
    expect(JSON.stringify(incidente?.[2])).toMatch(/1581|consentimiento/i);
  });

  it('el acceso SIGUE su curso: la lectura de placa era legítima', async () => {
    // Tirar el evento entero dejaría la talanquera cerrada por una casilla mal
    // puesta en la configuración del equipo.
    const { controlador, ejecutar } = montar({ permitido: true });
    await controlador.publicar(peticion(conRostro()), 'x');
    expect(ejecutar).toHaveBeenCalledOnce();
  });
});

describe('la evidencia nunca impide el acceso', () => {
  it('guarda la imagen con su tipo y una clave por dispositivo', async () => {
    const { controlador, guardar } = montar({});
    await controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x');
    const [clave, contenido, tipo] = guardar.mock.calls[0] as [string, Buffer, string];
    expect(clave).toContain('camara-entrada');
    expect(tipo).toBe('image/jpeg');
    // Los bytes llegan INTACTOS: un `toString('utf8')` por el camino los
    // habría corrompido y no se vería hasta abrir la evidencia.
    expect(Buffer.from(contenido).equals(JPEG)).toBe(true);
  });

  it('si el almacén tarda más que el presupuesto, se sigue SIN evidencia', async () => {
    vi.useFakeTimers();
    const { controlador, ejecutar } = montar({
      permitido: true,
      evidencia: () => new Promise<string>(() => undefined),
    });
    const enCurso = controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x');
    await vi.advanceTimersByTimeAsync(PRESUPUESTO_DE_EVIDENCIA_MS + 1);
    await enCurso;
    vi.useRealTimers();
    // Dejar la talanquera cerrada porque el almacén de objetos va lento sería
    // peor que perder la fotografía.
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({ evidenciaId: null }),
      expect.any(String),
    );
  });

  it('si el almacén falla, el evento sigue su camino', async () => {
    const { controlador, ejecutar, accionar } = montar({
      permitido: true,
      evidencia: async () => {
        throw new Error('bucket caído');
      },
    });
    await controlador.publicar(peticion(sobre(XML_DE_PLACA)), 'x');
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({ evidenciaId: null }),
      expect.any(String),
    );
    expect(accionar).toHaveBeenCalledOnce();
  });

  it('sin imagen en el sobre, no se llama al almacén', async () => {
    const { controlador, guardar } = montar({});
    await controlador.publicar(peticion(sobre(XML_DE_PLACA, false)), 'x');
    expect(guardar).not.toHaveBeenCalled();
  });
});
