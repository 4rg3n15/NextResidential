import { beforeEach, describe, expect, it } from 'vitest';
import { FiltroDeEventos, esExito, esFallo, permitir } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { RegistrarAcceso, tipoDeEvento } from './registrar-acceso';
import type { ConstanciaDeAcceso, HechoEntrante } from './registrar-acceso';
import { EscalarAlerta } from './escalamiento';
import {
  RepositorioAlertasEnMemoria,
  RepositorioEventosEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import {
  bitacoraDePrueba,
  canalCon,
  canalQueFalla,
  idsSecuenciales,
  motorNiega,
  motorPermite,
  pushDePrueba,
  relojFijo,
  version,
} from './dobles';
import type { BitacoraDePrueba } from './dobles';

const COP = 'cop-1';
const T0 = new Date('2026-09-08T14:00:00Z');
const ACTOR = 'actor-1';

const hecho = (extra: Partial<HechoEntrante> = {}): HechoEntrante => ({
  copropiedadId: COP,
  dispositivoId: 'disp-1',
  metodo: 'placa',
  referenciaExterna: 'ref-1',
  confianza: 0.97,
  viviendaId: 'viv-1',
  ...extra,
});

const abrir = (r: Resultado<ConstanciaDeAcceso, ErrorDominio>): ConstanciaDeAcceso => {
  if (!esExito(r)) throw new Error(`se esperaba éxito: ${r.error.detalle}`);
  return r.valor;
};

interface Montaje {
  caso: RegistrarAcceso;
  eventos: RepositorioEventosEnMemoria;
  alertas: RepositorioAlertasEnMemoria;
  bitacora: BitacoraDePrueba;
  push: ReturnType<typeof pushDePrueba>;
  canal: ReturnType<typeof canalCon>;
}

const montar = (
  motor = motorPermite(COP),
  destinatarios = 1,
  canalPropio?: ReturnType<typeof canalQueFalla>,
): Montaje => {
  const eventos = new RepositorioEventosEnMemoria();
  const alertas = new RepositorioAlertasEnMemoria();
  const bitacora = bitacoraDePrueba();
  const push = pushDePrueba();
  const canal = canalCon(destinatarios);
  const reloj = relojFijo(T0);
  const escalador = new EscalarAlerta(canalPropio ?? canal, alertas, reloj, bitacora, push);
  return {
    caso: new RegistrarAcceso(
      motor,
      eventos,
      alertas,
      canalPropio ?? canal,
      escalador,
      reloj,
      idsSecuenciales('evt'),
      bitacora,
      push,
    ),
    eventos,
    alertas,
    bitacora,
    push,
    canal,
  };
};

describe('RegistrarAcceso · RN-02, ningún acceso sin evento', () => {
  let m: Montaje;
  beforeEach(() => {
    m = montar();
  });

  it('un acceso permitido deja evento', async () => {
    const constancia = abrir(await m.caso.ejecutar(hecho(), ACTOR));
    expect(constancia.permitido).toBe(true);
    expect(constancia.duplicado).toBe(false);
    expect(m.eventos.total).toBe(1);
  });

  it('un acceso NEGADO también deja evento: es el que más importa auditar', async () => {
    const negado = montar(motorNiega(COP, 'VIGENCIA_EXPIRADA'));
    const constancia = abrir(await negado.caso.ejecutar(hecho(), ACTOR));
    expect(constancia.permitido).toBe(false);
    expect(negado.eventos.total).toBe(1);
  });

  it('la clave de idempotencia la construye el dominio y se devuelve', async () => {
    const constancia = abrir(await m.caso.ejecutar(hecho(), ACTOR));
    expect(constancia.claveIdempotencia).toBe('cop-1:disp-1:placa:ref-1');
  });

  it('rechaza un componente de clave con caracteres no admitidos (RN-17)', async () => {
    const r = await m.caso.ejecutar(hecho({ referenciaExterna: 'ref con espacios' }), ACTOR);
    expect(esFallo(r)).toBe(true);
    expect(m.eventos.total).toBe(0);
  });
});

describe('RegistrarAcceso · RN-17 y CA-22, el reintento se descarta en silencio', () => {
  it('el segundo envío del mismo hecho no crea un segundo evento', async () => {
    const m = montar();
    const primero = abrir(await m.caso.ejecutar(hecho(), ACTOR));
    const segundo = abrir(await m.caso.ejecutar(hecho(), ACTOR));

    expect(segundo.duplicado).toBe(true);
    expect(segundo.eventoId).toBe(primero.eventoId);
    expect(m.eventos.total).toBe(1);
  });

  it('el duplicado NO vuelve a publicar ni a alertar', async () => {
    const m = montar(motorNiega(COP, 'LISTA_NEGRA'));
    await m.caso.ejecutar(hecho(), ACTOR);
    const publicacionesTrasElPrimero = m.canal.publicaciones.length;

    await m.caso.ejecutar(hecho(), ACTOR);
    // Republicar un duplicado haría sonar dos veces la misma alerta crítica en
    // la consola del operador, que es cómo se aprende a ignorarlas.
    expect(m.canal.publicaciones.length).toBe(publicacionesTrasElPrimero);
    expect((await m.alertas.abiertasDe(COP)).length).toBe(1);
  });

  it('un hecho distinto del mismo dispositivo sí entra', async () => {
    const m = montar();
    await m.caso.ejecutar(hecho(), ACTOR);
    const otro = abrir(await m.caso.ejecutar(hecho({ referenciaExterna: 'ref-2' }), ACTOR));
    expect(otro.duplicado).toBe(false);
    expect(m.eventos.total).toBe(2);
  });
});

describe('RegistrarAcceso · alertas y escalamiento (RN-18, CA-18)', () => {
  it('lista negra abre alerta crítica y la escala', async () => {
    const m = montar(motorNiega(COP, 'LISTA_NEGRA'));
    const constancia = abrir(await m.caso.ejecutar(hecho(), ACTOR));

    expect(constancia.alertaId).not.toBeNull();
    const abiertas = await m.alertas.abiertasDe(COP);
    expect(abiertas[0]?.tipo).toBe('lista_negra');
    expect(abiertas[0]?.severidad).toBe('critica');
    expect(abiertas[0]?.escaladaEn).not.toBeNull();
    expect(abiertas[0]?.escaladaDentroDelPlazo()).toBe(true);
  });

  it('una negación ordinaria no genera alerta', async () => {
    const m = montar(motorNiega(COP, 'VIGENCIA_EXPIRADA'));
    const constancia = abrir(await m.caso.ejecutar(hecho(), ACTOR));
    expect(constancia.alertaId).toBeNull();
    expect((await m.alertas.abiertasDe(COP)).length).toBe(0);
  });

  it('P-07 · un permiso con lectura sin confirmar escala a un humano', async () => {
    const m = montar(motorPermite(COP, true));
    const constancia = abrir(await m.caso.ejecutar(hecho(), ACTOR));
    const abiertas = await m.alertas.abiertasDe(COP);
    expect(constancia.alertaId).not.toBeNull();
    expect(abiertas[0]?.tipo).toBe('acceso_dudoso');
  });
});

describe('RegistrarAcceso · el transporte no puede tumbar la ingesta', () => {
  it('un canal que lanza deja el evento igualmente registrado', async () => {
    const m = montar(motorPermite(COP), 1, canalQueFalla());
    const constancia = abrir(await m.caso.ejecutar(hecho(), ACTOR));
    expect(constancia.duplicado).toBe(false);
    expect(m.eventos.total).toBe(1);
    expect(m.bitacora.lineas.some((l) => l.nivel === 'error')).toBe(true);
  });

  it('el evento se anexa ANTES de publicar: nunca se difunde lo que no está', async () => {
    // Si el orden se invirtiera, un fallo de persistencia dejaría a la consola
    // mostrando un acceso inexistente en el histórico.
    const m = montar();
    await m.caso.ejecutar(hecho(), ACTOR);
    // Rango amplio alrededor del instante fijo del reloj.
    const filtro = FiltroDeEventos.crear({
      copropiedadId: COP,
      desde: new Date(T0.getTime() - 1000),
      hasta: new Date(T0.getTime() + 1000),
    });
    if (!esExito(filtro)) throw new Error('filtro de prueba inválido');
    const pagina = await m.eventos.consultar(filtro.valor);
    expect(pagina.filas.length).toBe(1);
    expect(m.canal.publicaciones[0]?.tema).toBe('eventos');
  });
});

describe('RegistrarAcceso · aviso al residente (HU-34)', () => {
  it('avisa a la vivienda del evento', async () => {
    const m = montar();
    await m.caso.ejecutar(hecho(), ACTOR);
    expect(m.push.avisos).toContain('viv-1:Acceso registrado');
  });

  it('un evento sin vivienda no genera aviso', async () => {
    const m = montar();
    await m.caso.ejecutar(hecho({ viviendaId: null }), ACTOR);
    expect(m.push.avisos).toEqual([]);
  });

  it('la denegación también avisa, con su título propio', async () => {
    const m = montar(motorNiega(COP, 'VIGENCIA_EXPIRADA'));
    await m.caso.ejecutar(hecho(), ACTOR);
    expect(m.push.avisos).toContain('viv-1:Acceso denegado');
  });
});

describe('tipoDeEvento', () => {
  it('un permiso es ingreso', () => {
    expect(tipoDeEvento(hecho(), permitir(version(COP), 'r'))).toBe('ingreso');
  });

  it('con operador y motivo escritos, es manual (CA-16)', () => {
    expect(
      tipoDeEvento(
        hecho({ operadorId: 'op-1', motivoManual: 'proveedor esperado' }),
        permitir(version(COP), 'r'),
      ),
    ).toBe('manual');
  });

  it('un operador sin motivo NO convierte el evento en manual', () => {
    // Deliberado: si lo convirtiera, el agregado rechazaría el evento por
    // CA-16 y se perdería el registro del intento, que RN-02 exige guardar.
    expect(tipoDeEvento(hecho({ operadorId: 'op-1' }), permitir(version(COP), 'r'))).toBe(
      'ingreso',
    );
  });
});
