import { describe, expect, it } from 'vitest';
import { DESVIO_TOLERABLE_SEGUNDOS, diagnosticarEquipo, juzgarHora } from './diagnostico-de-equipo';
import { fichaDe } from './ficha';
import { CorreccionSinConfirmar, aplicarCorreccion } from './correcciones';
import { equipoSimulado, equiposSimulados } from '../simulacion/equipo-simulado';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL DIAGNÓSTICO TIENE QUE CONSEGUIR
 *
 * Que la consola pueda decir **qué cambiar**, y que nunca dé por comprobado algo
 * que no se miró. Lo segundo es el falso verde que este proyecto persigue,
 * aplicado a un equipo que contesta seis cosas y falla en la séptima.
 */

/** RFC 5737 · rango de DOCUMENTACIÓN: no es la dirección de nadie. */
const HOST = '203.0.113.40';
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

const camara = (guion: Record<string, unknown> = {}): typeof fetch =>
  equiposSimulados({ [HOST]: { familia: 'camara', ...CREDENCIAL, ...guion } });

const diagnosticar = async (guion: Record<string, unknown> = {}) =>
  diagnosticarEquipo({
    host: HOST,
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    familia: 'camara',
    peticion: camara(guion),
    ahoraDelServidor: () => new Date(0),
  });

describe('el contacto · lo primero que se pregunta NO lleva credenciales', () => {
  it('un equipo que contesta y autentica queda ALCANZADO', async () => {
    expect((await diagnosticar()).contacto.clase).toBe('alcanzado');
  });

  it('SIN NINGÚN EQUIPO en esa dirección, lo dice con esas palabras', async () => {
    const muerto: typeof fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const d = await diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'camara',
      peticion: muerto,
    });
    expect(d.contacto.clase).toBe('sin_equipo');
    expect(d.contacto.detalle).toContain(HOST);
  });

  it('CON equipo y credencial mala, es otra cosa, y avisa de no reintentar', async () => {
    // La diferencia es cara: una manda a revisar el cable y la VLAN, la otra el
    // usuario de servicio. Y reintentar la segunda bloquea la cuenta del equipo.
    const d = await diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      usuario: 'servicio',
      clave: 'la-que-no-es',
      protocolo: 'http',
      familia: 'camara',
      peticion: camara(),
    });
    expect(d.contacto.clase).toBe('credencial');
    expect(d.contacto.detalle).toMatch(/bloquean la cuenta/i);
  });

  it('sin contacto NO se inventan los demás veredictos: van todos nulos', async () => {
    const muerto: typeof fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const d = await diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'camara',
      peticion: muerto,
    });
    expect(d.control).toBeNull();
    expect(d.pais).toBeNull();
    expect(d.receptor).toBeNull();
  });
});

describe('lo que el diagnóstico lee de una cámara', () => {
  it('modelo, firmware y serie', async () => {
    const d = await diagnosticar({ modelo: 'MODELO-X', firmware: 'V1.2.3' });
    expect(d.modelo).toBe('MODELO-X');
    expect(d.firmware).toBe('V1.2.3');
    expect(d.serie).not.toBeNull();
  });

  it('el veredicto de quién decide, por las tres vías', async () => {
    const d = await diagnosticar();
    expect(d.control?.admisible).toBe(true);
    expect(d.disparador?.abrePorSuCuenta).toBe(false);
  });

  it('el país del algoritmo', async () => {
    expect((await diagnosticar({ indiceDePais: '0' })).pais?.clase).toBe('generico');
  });

  it('qué imágenes envía el equipo', async () => {
    expect((await diagnosticar({ imagenesDelEvento: 'all' })).receptor?.enviaRostros).toBe(true);
  });

  it('y si el modelo reporta el estado del brazo', async () => {
    expect((await diagnosticar({ reportaEstadoDeBarrera: false })).reportaEstadoDeBarrera).toBe(
      false,
    );
  });

  it('una consulta que el equipo NO soporta se ANOTA, no se da por buena', async () => {
    const d = await diagnosticar({ sinSoporte: ['leer la hora del equipo'] });
    expect(d.hora).toBeNull();
    expect(d.sinRespuesta.some((s) => /hora/.test(s.que))).toBe(true);
  });

  it('un equipo de otra familia no se juzga por lo que sólo tiene una cámara', async () => {
    const d = await diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'comun',
      peticion: equipoSimulado({ familia: 'terminal', ...CREDENCIAL }),
    });
    expect(d.control).toBeNull();
    expect(d.capacidades).toBeNull();
  });
});

describe('el reloj del equipo · invisible hasta que corrompe la trazabilidad', () => {
  it('dentro de tolerancia no es un hallazgo', () => {
    const ahora = new Date('2026-09-23T12:00:00Z');
    const veredicto = juzgarHora('<Time><localTime>2026-09-23T12:00:10Z</localTime></Time>', ahora);
    expect(veredicto.excesiva).toBe(false);
  });

  it('un desvío grande SÍ lo es, y dice que no produce ningún error', () => {
    const ahora = new Date('2026-09-23T12:00:00Z');
    const veredicto = juzgarHora('<Time><localTime>2026-09-23T17:00:00Z</localTime></Time>', ahora);
    expect(veredicto.excesiva).toBe(true);
    expect(veredicto.desvioSegundos).toBeGreaterThan(DESVIO_TOLERABLE_SEGUNDOS);
    expect(veredicto.detalle).toMatch(/No produce ningún error/i);
  });

  it('una hora ilegible se dice, no se convierte en cero', () => {
    const veredicto = juzgarHora('<Time><localTime>ayer</localTime></Time>', new Date(0));
    expect(veredicto.desvioSegundos).toBeNull();
  });
});

describe('la ficha · el diagnóstico en la forma que una pantalla puede pintar', () => {
  it('un equipo conforme no deja ningún bloqueo', async () => {
    const ficha = fichaDe(await diagnosticar());
    expect(ficha.hallazgos.filter((h) => h.estado === 'bloqueo')).toHaveLength(0);
  });

  it('un equipo que decide por su cuenta deja un bloqueo CON su corrección', async () => {
    const ficha = fichaDe(await diagnosticar({ ctrlMod: '0' }));
    const bloqueo = ficha.hallazgos.find((h) => h.estado === 'bloqueo');
    expect(bloqueo?.correccion).toBe('modo_de_control');
    expect(bloqueo?.valorCorrecto).toBe('1');
  });

  it('el país mal configurado deja un aviso con su corrección', async () => {
    const ficha = fichaDe(await diagnosticar({ indiceDePais: '0' }));
    expect(ficha.hallazgos.some((h) => h.correccion === 'pais_del_algoritmo')).toBe(true);
  });

  it('las imágenes con rostros dejan aviso con su corrección', async () => {
    const ficha = fichaDe(await diagnosticar({ imagenesDelEvento: 'all' }));
    expect(ficha.hallazgos.some((h) => h.correccion === 'imagenes_del_receptor')).toBe(true);
  });

  it('LO QUE MÁS IMPORTA · lo no comprobado NO se pinta como conforme', async () => {
    const muerto: typeof fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const ficha = fichaDe(
      await diagnosticarEquipo({
        host: HOST,
        puerto: 80,
        protocolo: 'http',
        ...CREDENCIAL,
        familia: 'camara',
        peticion: muerto,
      }),
    );
    expect(ficha.hallazgos.every((h) => h.estado !== 'conforme')).toBe(true);
    expect(ficha.hallazgos.some((h) => h.estado === 'no_comprobado')).toBe(true);
  });

  it('el relé que abre se enseña porque se LEYÓ, no porque se supusiera', async () => {
    const ficha = fichaDe(await diagnosticar());
    expect(ficha.hallazgos.some((h) => /relé/.test(h.campo))).toBe(true);
  });
});

describe('las correcciones · ninguna se aplica sola', () => {
  const corregir = (
    clase:
      | 'modo_de_control'
      | 'pais_del_algoritmo'
      | 'imagenes_del_receptor'
      | 'formato_del_receptor'
      | 'verificacion_remota',
    extra: Record<string, unknown> = {},
  ) =>
    aplicarCorreccion({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      clase,
      confirmadaPor: 'operador-1',
      peticion: camara(extra),
    });

  it('SIN CONFIRMACIÓN no se emite la petición: lanza', async () => {
    await expect(
      aplicarCorreccion({
        host: HOST,
        puerto: 80,
        protocolo: 'http',
        ...CREDENCIAL,
        clase: 'modo_de_control',
        confirmadaPor: '   ',
        peticion: camara(),
      }),
    ).rejects.toBeInstanceOf(CorreccionSinConfirmar);
  });

  it('el modo de control se corrige y devuelve el valor ANTERIOR y el nuevo', async () => {
    // Sin los dos, la constancia diría que alguien corrigió algo y no qué.
    const r = await corregir('modo_de_control', { ctrlMod: '0' });
    expect(r.aplicada).toBe(true);
    expect(r.valorAnterior).toBe('0');
    expect(r.valorNuevo).toBe('1');
  });

  it('el país también', async () => {
    const r = await corregir('pais_del_algoritmo', { indiceDePais: '0' });
    expect(r.aplicada).toBe(true);
    expect(r.valorAnterior).toBe('0');
    expect(r.valorNuevo).toBe('210');
  });

  it('y el formato del receptor', async () => {
    const r = await corregir('formato_del_receptor', { formatoDeNotificacion: 'JSON' });
    expect(r.aplicada).toBe(true);
    expect(r.valorNuevo).toBe('XML');
  });

  it('PEDIR QUE EL EQUIPO ENVÍE ROSTROS no es una corrección: se niega', async () => {
    // Es lo contrario de lo que esta función existe para hacer (RN-09, RN-10).
    const r = await aplicarCorreccion({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      clase: 'imagenes_del_receptor',
      imagenes: 'all',
      confirmadaPor: 'operador-1',
      peticion: camara(),
    });
    expect(r.aplicada).toBe(false);
    expect(r.detalle).toMatch(/biométrico|minimizar/i);
  });

  it('un equipo inalcanzable no se da por corregido', async () => {
    const muerto: typeof fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const r = await aplicarCorreccion({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      clase: 'modo_de_control',
      confirmadaPor: 'operador-1',
      peticion: muerto,
    });
    expect(r.aplicada).toBe(false);
    expect(r.detalle).toMatch(/no se pudo alcanzar/i);
  });

  it('si el equipo no devuelve el documento, NO se escribe a ciegas', async () => {
    const r = await corregir('modo_de_control', {
      sinSoporte: ['leer quién controla la barrera: la cámara o la plataforma'],
    });
    expect(r.aplicada).toBe(false);
    expect(r.detalle).toMatch(/no se escribe a ciegas|no devolvió/i);
  });

  it('UN RECHAZO CON HTTP 200 tampoco se lee como documento', async () => {
    // Así rechazan estos equipos: contestan 200 y meten el motivo dentro.
    // Escribir lo que salga de ahí es cómo se borra su configuración.
    const r = await corregir('pais_del_algoritmo', {
      sinSoporte: ['leer el país con el que el algoritmo lee las placas'],
    });
    expect(r.aplicada).toBe(false);
  });

  it('el país tampoco se escribe si al documento le falta un campo obligatorio', async () => {
    // El `PUT` exige el documento completo: escribirlo a medias borraría la
    // identificación del punto de captura.
    const aMedias: typeof fetch = (entrada, opciones) =>
      String(entrada).includes('/basic') && (opciones?.method ?? 'GET') === 'GET'
        ? Promise.resolve(
            new Response('<BasicInfo><CRIndex>0</CRIndex></BasicInfo>', {
              status: 200,
              headers: { 'content-type': 'application/xml' },
            }),
          )
        : camara()(entrada, opciones);
    const r = await aplicarCorreccion({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      clase: 'pais_del_algoritmo',
      confirmadaPor: 'operador-1',
      peticion: aMedias,
    });
    expect(r.aplicada).toBe(false);
    expect(r.detalle).toMatch(/borraría la identificación/i);
  });

  it('si el equipo RECHAZA la escritura, la corrección no se da por aplicada', async () => {
    const r = await corregir('imagenes_del_receptor', {
      sinSoporte: ['apuntar el equipo a nuestro receptor'],
    });
    expect(r.aplicada).toBe(false);
    expect(r.valorNuevo).toBeNull();
  });

  it('y las imágenes se bajan a la opción que NO envía rostros', async () => {
    const r = await corregir('imagenes_del_receptor', { imagenesDelEvento: 'all' });
    expect(r.aplicada).toBe(true);
    expect(r.valorAnterior).toBe('all');
    expect(r.valorNuevo).toBe('detectionPicture');
  });
});

describe('lo que NO se le pregunta a un equipo que no es una cámara', () => {
  /**
   * El diagnóstico se usa con las tres familias, y las consultas de «quién
   * decide» sólo existen en la cámara. Preguntárselas a una terminal facial
   * devolvería `404` de rutas que ese firmware no tiene y llenaría la ficha de
   * consultas sin respuesta que no son un defecto del aparato, sino una
   * pregunta mal hecha.
   */
  const terminal = (guion: Record<string, unknown> = {}): typeof fetch =>
    equiposSimulados({ [HOST]: { familia: 'terminal', ...CREDENCIAL, ...guion } });

  const diagnosticarTerminal = () =>
    diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'terminal',
      peticion: terminal(),
      ahoraDelServidor: () => new Date(0),
    });

  it('se alcanza y se identifica igual que una cámara', async () => {
    const d = await diagnosticarTerminal();
    expect(d.contacto.clase).toBe('alcanzado');
    expect(d.modelo).toBe('SIMULADO');
  });

  it('pero los seis veredictos de cámara quedan NULOS, no en falso', async () => {
    // Nulo significa «no aplica»; `false` significaría «se miró y está mal».
    const d = await diagnosticarTerminal();
    expect(d.control).toBeNull();
    expect(d.disparador).toBeNull();
    expect(d.pais).toBeNull();
    expect(d.receptor).toBeNull();
    expect(d.capacidades).toBeNull();
    expect(d.reportaEstadoDeBarrera).toBeNull();
  });

  it('y ninguna de esas consultas aparece como SIN RESPUESTA: no se hicieron', async () => {
    const d = await diagnosticarTerminal();
    expect(d.sinRespuesta.some((s) => /barrera|placas|receptor|disparador/.test(s.que))).toBe(
      false,
    );
  });

  it('el reloj sí se comprueba: la trazabilidad no depende de la familia', async () => {
    expect((await diagnosticarTerminal()).hora?.desvioSegundos).toBe(0);
  });
});

describe('un equipo que contesta a unas consultas y se cae en otra', () => {
  it('lo que sí llegó se conserva, y lo que se cayó SE DICE', async () => {
    // Éste es el escenario que motivó que nada de esto lance: una ficha vacía
    // por una consulta perdida enseñaría «error» donde hay cinco respuestas.
    const base = camara();
    const seCaeAlPedirLaHora: typeof fetch = (entrada, opciones) =>
      String(entrada).includes('/System/time')
        ? Promise.reject(new Error('socket hang up'))
        : base(entrada, opciones);
    const d = await diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'camara',
      peticion: seCaeAlPedirLaHora,
    });
    expect(d.contacto.clase).toBe('alcanzado');
    expect(d.control).not.toBeNull();
    expect(d.hora).toBeNull();
    expect(d.sinRespuesta.some((s) => /hora/.test(s.que))).toBe(true);
  });
});

describe('las dos formas de contacto que no son ni el sí ni el no limpios', () => {
  const respuesta = (cuerpo: string, estado: number): Response =>
    new Response(cuerpo, { status: estado, headers: { 'content-type': 'application/xml' } });

  it('un equipo que responde con un ERROR SUYO está alcanzado, no rechazando credencial', async () => {
    // Confundirlos manda a revisar el usuario de servicio cuando lo que hay es
    // un aparato con un fallo interno que sí aceptó la credencial.
    const conFalloInterno: typeof fetch = (entrada) =>
      Promise.resolve(
        String(entrada).includes('/System/deviceInfo')
          ? respuesta(
              '<ResponseStatus><statusCode>3</statusCode>' +
                '<statusString>Device Error</statusString></ResponseStatus>',
              500,
            )
          : respuesta('<ActivateStatus><activated>true</activated></ActivateStatus>', 200),
      );
    const d = await diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'comun',
      peticion: conFalloInterno,
    });
    expect(d.contacto.clase).toBe('alcanzado');
    expect(d.contacto.detalle).toMatch(/responde con un error/i);
  });

  it('y uno que responde a la activación pero se cae en la identidad es CREDENCIAL, no ausencia', async () => {
    // Hay algo escuchando: decir «no hay ningún equipo» mandaría a revisar la
    // VLAN de un aparato que está ahí.
    const mediaCaida: typeof fetch = (entrada) =>
      String(entrada).includes('/SDK/activateStatus')
        ? Promise.resolve(
            respuesta('<ActivateStatus><activated>true</activated></ActivateStatus>', 200),
          )
        : Promise.reject(new Error('socket hang up'));
    const d = await diagnosticarEquipo({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'comun',
      peticion: mediaCaida,
    });
    expect(d.contacto.clase).toBe('credencial');
    expect(d.contacto.detalle).toContain(HOST);
    expect(d.contacto.detalle).toMatch(/algo escuchando/i);
  });
});

describe('el reloj leído del otro nombre de campo', () => {
  it('algunos modelos lo llaman `time` y no `localTime`: vale igual', async () => {
    const h = juzgarHora(
      '<Time><time>2026-09-23T12:00:30Z</time></Time>',
      new Date('2026-09-23T12:00:00Z'),
    );
    expect(h.desvioSegundos).toBe(30);
    expect(h.excesiva).toBe(false);
  });

  it('y el umbral es el declarado, no uno inventado en la prueba', () => {
    const h = juzgarHora(
      '<Time><time>2026-09-23T12:00:00Z</time></Time>',
      new Date(Date.parse('2026-09-23T12:00:00Z') + (DESVIO_TOLERABLE_SEGUNDOS + 1) * 1000),
    );
    expect(h.excesiva).toBe(true);
  });
});

describe('cuando el equipo acepta la lectura y RECHAZA la escritura', () => {
  const corregirCon = (
    clase: 'modo_de_control' | 'pais_del_algoritmo',
    guion: Record<string, unknown>,
  ) =>
    aplicarCorreccion({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      clase,
      confirmadaPor: 'operador-1',
      peticion: camara(guion),
    });

  it('el modo NO se da por corregido, y el valor nuevo queda nulo', async () => {
    // Dar por aplicado lo que el equipo rechazó es peor que no intentarlo: deja
    // en `auditoria_seguridad` una constancia de un cambio que nunca ocurrió.
    const r = await corregirCon('modo_de_control', {
      ctrlMod: '0',
      sinSoporte: ['corregir quién controla la barrera'],
    });
    expect(r.aplicada).toBe(false);
    expect(r.valorAnterior).toBe('0');
    expect(r.valorNuevo).toBeNull();
  });

  it('el país tampoco, y conserva el valor anterior para la constancia', async () => {
    const r = await corregirCon('pais_del_algoritmo', {
      indiceDePais: '0',
      sinSoporte: ['fijar el país del algoritmo'],
    });
    expect(r.aplicada).toBe(false);
    expect(r.valorAnterior).toBe('0');
    expect(r.valorNuevo).toBeNull();
  });
});

/**
 * A2 (ETAPA 15-E) · activar la verificación remota es cambiar QUIÉN decide.
 * Se lee, se modifica UN campo y se escribe el documento entero; el simulado
 * lo recuerda, así que la lectura siguiente —la de la ficha— lo ve.
 */
describe('A2 · la corrección de verificación remota de la terminal', () => {
  const terminalQueDecideSola = () =>
    equipoSimulado({ familia: 'terminal', ...CREDENCIAL, verificacionRemota: false });

  it('lee-modifica-escribe AcsCfg y devuelve el valor anterior y el nuevo', async () => {
    const peticion = terminalQueDecideSola();
    const r = await aplicarCorreccion({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      clase: 'verificacion_remota',
      confirmadaPor: 'operador-1',
      peticion,
    });
    expect(r.aplicada).toBe(true);
    expect(r.valorAnterior).toBe('false');
    expect(r.valorNuevo).toBe('true');

    // Y la ficha, después, ya no la marca como bloqueo: el equipo cambió.
    const ficha = fichaDe(
      await diagnosticarEquipo({
        host: HOST,
        puerto: 80,
        protocolo: 'http',
        ...CREDENCIAL,
        familia: 'terminal',
        peticion,
      }),
    );
    expect(ficha.hallazgos.find((h) => /quién decide/.test(h.campo))?.estado).toBe('conforme');
  });

  it('SIN confirmación no se toca el equipo', async () => {
    await expect(
      aplicarCorreccion({
        host: HOST,
        puerto: 80,
        protocolo: 'http',
        ...CREDENCIAL,
        clase: 'verificacion_remota',
        confirmadaPor: '',
        peticion: terminalQueDecideSola(),
      }),
    ).rejects.toThrow(/confirmación/);
  });

  it('un firmware que no declara el campo NO se escribe a ciegas: es un bloqueo', async () => {
    const r = await aplicarCorreccion({
      host: HOST,
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      clase: 'verificacion_remota',
      confirmadaPor: 'operador-1',
      peticion: equipoSimulado({ familia: 'terminal', ...CREDENCIAL, sinCapacidades: true }),
    });
    expect(r.aplicada).toBe(false);
    expect(r.detalle).toMatch(/no declara|a ciegas/i);
  });
});
