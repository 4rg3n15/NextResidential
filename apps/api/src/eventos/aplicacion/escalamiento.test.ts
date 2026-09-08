import { describe, expect, it } from 'vitest';
import { Alerta, PLAZO_ESCALAMIENTO_MS, esExito } from '@ncr/domain-core';
import { EscalarAlerta } from './escalamiento';
import { RepositorioAlertasEnMemoria } from '../infraestructura/repositorios-en-memoria';
import { bitacoraDePrueba, canalCon, canalQueFalla, pushDePrueba, relojFijo } from './dobles';

const COP = 'cop-1';
const T0 = new Date('2026-09-08T14:00:00Z');
const ACTOR = 'actor-1';

const alerta = (generadaEn = T0): Alerta => {
  const r = Alerta.abrir({
    id: 'al-1',
    copropiedadId: COP,
    tipo: 'lista_negra',
    severidad: 'critica',
    generadaEn,
    eventoId: 'evt-1',
  });
  if (!esExito(r)) throw new Error('alerta de prueba inválida');
  return r.valor;
};

describe('EscalarAlerta · KPI-25 medido, no supuesto', () => {
  it('con un operador conectado, escala dentro del plazo', async () => {
    const alertas = new RepositorioAlertasEnMemoria();
    const caso = new EscalarAlerta(canalCon(1), alertas, relojFijo(T0), bitacoraDePrueba());

    const r = await caso.ejecutar(alerta(), ACTOR);
    expect(r.destinatarios).toBe(1);
    expect(r.latenciaMs).toBe(0);
    expect(r.dentroDelPlazo).toBe(true);
    expect((await alertas.porId(COP, 'al-1'))?.escaladaEn).not.toBeNull();
  });

  it('CERO destinatarios NO cuenta como escalamiento aunque el reloj cuadre', async () => {
    // Es la trampa que haría que KPI-25 diera siempre verde: publicar en un
    // canal que nadie escucha tarda 0 ms y no llega a nadie.
    const alertas = new RepositorioAlertasEnMemoria();
    const bitacora = bitacoraDePrueba();
    const caso = new EscalarAlerta(canalCon(0), alertas, relojFijo(T0), bitacora);

    const r = await caso.ejecutar(alerta(), ACTOR);
    expect(r.destinatarios).toBe(0);
    expect(r.dentroDelPlazo).toBe(false);
    expect(bitacora.lineas.some((l) => l.mensaje.includes('sin operador'))).toBe(true);
  });

  it('sin operador dispara el respaldo (CU-03, flujo alterno)', async () => {
    const push = pushDePrueba();
    const caso = new EscalarAlerta(
      canalCon(0),
      new RepositorioAlertasEnMemoria(),
      relojFijo(T0),
      bitacoraDePrueba(),
      push,
    );
    await caso.ejecutar(alerta(), ACTOR);
    expect(push.avisos.some((a) => a.startsWith('guardia:'))).toBe(true);
  });

  it('una alerta generada hace más del plazo se sella FUERA de plazo', async () => {
    const generada = new Date(T0.getTime() - (PLAZO_ESCALAMIENTO_MS + 1));
    const caso = new EscalarAlerta(
      canalCon(2),
      new RepositorioAlertasEnMemoria(),
      relojFijo(T0),
      bitacoraDePrueba(),
    );

    const r = await caso.ejecutar(alerta(generada), ACTOR);
    expect(r.latenciaMs).toBe(PLAZO_ESCALAMIENTO_MS + 1);
    expect(r.dentroDelPlazo).toBe(false);
  });

  it('el borde exacto del plazo cumple', async () => {
    const generada = new Date(T0.getTime() - PLAZO_ESCALAMIENTO_MS);
    const caso = new EscalarAlerta(
      canalCon(1),
      new RepositorioAlertasEnMemoria(),
      relojFijo(T0),
      bitacoraDePrueba(),
    );
    expect((await caso.ejecutar(alerta(generada), ACTOR)).dentroDelPlazo).toBe(true);
  });

  it('registra la latencia y el plazo en la bitácora, para poder demostrarlo', async () => {
    const bitacora = bitacoraDePrueba();
    const caso = new EscalarAlerta(
      canalCon(3),
      new RepositorioAlertasEnMemoria(),
      relojFijo(T0),
      bitacora,
    );
    await caso.ejecutar(alerta(), ACTOR);

    const linea = bitacora.lineas.find((l) => l.mensaje === 'alerta escalada');
    expect(linea?.contexto?.['latenciaMs']).toBe(0);
    expect(linea?.contexto?.['plazoMs']).toBe(PLAZO_ESCALAMIENTO_MS);
    expect(linea?.contexto?.['destinatarios']).toBe(3);
  });
});

describe('EscalarAlerta · el transporte es sustituible y su fallo no propaga', () => {
  it('un canal que lanza deja la alerta guardada y sellada', async () => {
    const alertas = new RepositorioAlertasEnMemoria();
    const bitacora = bitacoraDePrueba();
    const caso = new EscalarAlerta(canalQueFalla(), alertas, relojFijo(T0), bitacora);

    const r = await caso.ejecutar(alerta(), ACTOR);
    expect(r.destinatarios).toBe(0);
    expect((await alertas.porId(COP, 'al-1'))?.escaladaEn).not.toBeNull();
    expect(bitacora.lineas.some((l) => l.nivel === 'error')).toBe(true);
  });

  it('un respaldo que falla tampoco propaga', async () => {
    const push = {
      aVivienda: async (): Promise<number> => {
        throw new Error('FCM caído');
      },
    };
    const bitacora = bitacoraDePrueba();
    const caso = new EscalarAlerta(
      canalCon(0),
      new RepositorioAlertasEnMemoria(),
      relojFijo(T0),
      bitacora,
      push,
    );
    await expect(caso.ejecutar(alerta(), ACTOR)).resolves.toBeDefined();
    expect(bitacora.lineas.some((l) => l.mensaje.includes('respaldo'))).toBe(true);
  });
});
