import { describe, expect, it } from 'vitest';
import { FilaPorClave } from './fila-por-clave';
import { RegistrarAcceso } from './registrar-acceso';
import { EscalarAlerta } from './escalamiento';
import {
  RepositorioAlertasEnMemoria,
  RepositorioEventosEnMemoria,
} from '../infraestructura/repositorios-en-memoria';
import {
  bitacoraDePrueba,
  canalCon,
  idsSecuenciales,
  motorNiega,
  pushDePrueba,
  relojFijo,
} from './dobles';

/**
 * 15-R · E5 · DT-15N-01 · dos lecturas simultáneas del mismo equipo no abren dos
 * alertas; las de equipos distintos no se esperan entre sí.
 */
const COP = 'cop-1';

describe('FilaPorClave', () => {
  it('encadena por clave y deja correr en paralelo las claves distintas', async () => {
    const fila = new FilaPorClave();
    const orden: string[] = [];
    const tarea = (n: string, ms: number) => async () => {
      orden.push(`empieza ${n}`);
      await new Promise((r) => setTimeout(r, ms));
      orden.push(`termina ${n}`);
      return n;
    };
    await Promise.all([
      fila.en('a', tarea('a1', 20)),
      fila.en('a', tarea('a2', 1)),
      fila.en('b', tarea('b1', 1)),
    ]);
    expect(orden.indexOf('termina a1')).toBeLessThan(orden.indexOf('empieza a2'));
    expect(orden.indexOf('empieza b1')).toBeLessThan(orden.indexOf('termina a1'));
  });

  it('un fallo de una tarea no bloquea a la siguiente de la misma clave', async () => {
    const fila = new FilaPorClave();
    const mala = fila.en('a', async () => Promise.reject(new Error('x')));
    const buena = fila.en('a', async () => 'ok');
    await expect(mala).rejects.toThrow('x');
    await expect(buena).resolves.toBe('ok');
  });
});

describe('RegistrarAcceso · E5 · la carrera de la alerta', () => {
  it('dos placas desconocidas del mismo equipo, a la vez: UNA alerta, no dos', async () => {
    const alertas = new RepositorioAlertasEnMemoria();
    const bitacora = bitacoraDePrueba();
    const canal = canalCon(1);
    const reloj = relojFijo(new Date('2026-10-03T12:00:00Z'));
    const caso = new RegistrarAcceso(
      motorNiega(COP, 'PLACA_DESCONOCIDA'),
      new RepositorioEventosEnMemoria(),
      alertas,
      canal,
      new EscalarAlerta(canal, alertas, reloj, bitacora, pushDePrueba()),
      reloj,
      idsSecuenciales('evt'),
      bitacora,
    );
    const lectura = (ref: string) =>
      caso.ejecutar(
        {
          copropiedadId: COP,
          dispositivoId: 'camara-1',
          metodo: 'placa',
          referenciaExterna: ref,
          confianza: 0.97,
          viviendaId: null,
        },
        'actor',
      );
    const [a, b] = await Promise.all([lectura('ref-1'), lectura('ref-2')]);
    const ids = [a, b].map((r) => (r.ok ? r.valor.alertaId : 'fallo'));
    expect(ids[0]).not.toBeNull();
    expect(ids[1]).toBe(ids[0]);
  });
});
