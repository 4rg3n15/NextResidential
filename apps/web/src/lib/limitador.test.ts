import { describe, expect, it } from 'vitest';
import { Limitador, claveDeIdentidad, ipDe } from './limitador';

describe('Limitador', () => {
  const conReloj = (permitidos: number, ventanaMs: number) => {
    let t = 1_000_000;
    const l = new Limitador({ permitidos, ventanaMs }, () => t);
    return { l, avanzar: (ms: number) => (t += ms) };
  };

  it('admite hasta el cupo y rechaza el siguiente', () => {
    const { l } = conReloj(3, 60_000);
    expect([l.consultar('a'), l.consultar('a'), l.consultar('a')].every((v) => v.admitido)).toBe(
      true,
    );
    expect(l.consultar('a').admitido).toBe(false);
  });

  it('cada clave lleva su propio cupo', () => {
    // Sin esto, el primer usuario que agotara el cupo bloquearía a todos.
    const { l } = conReloj(1, 60_000);
    expect(l.consultar('a').admitido).toBe(true);
    expect(l.consultar('b').admitido).toBe(true);
    expect(l.consultar('a').admitido).toBe(false);
  });

  it('la ventana es deslizante: al caducar la más antigua se vuelve a admitir', () => {
    const { l, avanzar } = conReloj(2, 60_000);
    l.consultar('a');
    avanzar(30_000);
    l.consultar('a');
    expect(l.consultar('a').admitido).toBe(false);
    // A los 60 s de la PRIMERA, esa caduca y queda un hueco.
    avanzar(30_001);
    expect(l.consultar('a').admitido).toBe(true);
  });

  it('dice cuánto falta, y nunca cero: un 0 invitaría a reintentar al instante', () => {
    const { l, avanzar } = conReloj(1, 60_000);
    l.consultar('a');
    expect(l.consultar('a').reintentarEnSegundos).toBe(60);
    avanzar(59_500);
    expect(l.consultar('a').reintentarEnSegundos).toBeGreaterThanOrEqual(1);
  });

  it('un rechazo NO consume cupo, o el bloqueo se renovaría solo indefinidamente', () => {
    const { l, avanzar } = conReloj(1, 10_000);
    l.consultar('a');
    for (let i = 0; i < 5; i += 1) l.consultar('a');
    avanzar(10_001);
    expect(l.consultar('a').admitido).toBe(true);
  });
});

describe('claveDeIdentidad', () => {
  it('normaliza mayúsculas y espacios: un buzón, un cupo', () => {
    // Sin normalizar, `Admin@X.com` y `admin@x.com` serían dos cupos para el
    // mismo destinatario y el tope por identidad no serviría de nada.
    expect(claveDeIdentidad('  Admin@X.COM ')).toBe('admin@x.com');
  });

  it('acota la longitud, para que la clave no sea la carga del atacante', () => {
    expect(claveDeIdentidad('a'.repeat(5000)).length).toBe(254);
  });
});

/**
 * Estas dos pruebas SÍ necesitan direcciones con forma de IP: lo que se
 * comprueba es el análisis de `X-Forwarded-For`. Se usan las de RFC 5737
 * —rangos reservados para documentación, que no encaminan a ninguna parte— y se
 * declara la exención de KPI-11 línea a línea, que es como ese control admite
 * excepciones: de forma auditable, nunca en silencio. No son direcciones de
 * dispositivo; son de un cliente HTTP, que es lo que KPI-11 vigila que no
 * aparezca fuera de `packages/providers`.
 */
describe('ipDe', () => {
  it('toma la primera de X-Forwarded-For', () => {
    const cabecera = ['203.0.113.7', '10.0.0.1'].join(', '); // kpi-11-exento: RFC 5737, cliente
    expect(ipDe(new Headers({ 'x-forwarded-for': cabecera }))).toBe('203.0.113.7'); // kpi-11-exento
  });

  it('cae a X-Real-IP y, sin nada, a un marcador en vez de a cadena vacía', () => {
    // Una clave vacía juntaría en un solo cupo a todo el que llegue sin
    // cabecera, que es lo contrario de limitar por IP.
    const real = '198.51.100.4'; // kpi-11-exento: RFC 5737, dirección de cliente
    expect(ipDe(new Headers({ 'x-real-ip': real }))).toBe(real);
    expect(ipDe(new Headers())).toBe('desconocida');
    expect(ipDe(new Headers({ 'x-forwarded-for': '   ' }))).toBe('desconocida');
  });
});
