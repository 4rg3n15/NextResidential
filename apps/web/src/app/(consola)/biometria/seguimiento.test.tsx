import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SeguimientoDeConsentimiento } from './seguimiento';

/**
 * A3 (15-E) · el seguimiento tras la captura. Lo que se fija: el enlace se
 * MUESTRA para entregarlo y no se abre; sin aceptación del titular no se
 * sincroniza; con aceptación, el resumen nombra cada terminal.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const CONSENTIMIENTO = '50000000-0000-4000-8000-000000000001';
const PLANTILLA = '60000000-0000-4000-8000-000000000001';

const json = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let respuestas: Record<string, (metodo: string) => Response>;

beforeEach(() => {
  respuestas = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      // `openapi-fetch` entrega un `Request` ya armado contra `/api/ncr/…`,
      // el proxy de la consola; aquí se responde por la ruta de la API.
      const url = entrada instanceof Request ? entrada.url : String(entrada);
      const metodo = entrada instanceof Request ? entrada.method : (init?.method ?? 'GET');
      const ruta = new URL(url, 'http://consola.invalid').pathname.replace(/^\/api\/ncr/, '');
      const manejador = respuestas[ruta];
      return manejador === undefined
        ? json({ mensaje: `no previsto: ${ruta}` }, 500)
        : manejador(metodo);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const montar = (): void => {
  render(
    <SeguimientoDeConsentimiento
      copropiedadId={COP}
      consentimientoId={CONSENTIMIENTO}
      plantillaId={PLANTILLA}
    />,
  );
};

describe('SeguimientoDeConsentimiento', () => {
  it('no ofrece ningún modo de ACEPTAR por el titular (RN-10)', () => {
    montar();
    const botones = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(botones.some((t) => /^acept|consiento|autorizo/i.test(t))).toBe(false);
  });

  it('emite el enlace y lo muestra para entregarlo; sin API_URL_PUBLICA avisa', async () => {
    respuestas[`/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}/enlace`] = () =>
      json({
        consentimientoId: CONSENTIMIENTO,
        estado: 'pendiente',
        token: 'abc.def',
        ruta: '/consentimiento/abc.def',
        url: null,
        expiraEn: new Date(Date.now() + 3_600_000).toISOString(),
      });
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Generar enlace para el titular/ }));
    const campo = await screen.findByLabelText('Enlace del titular');
    expect((campo as HTMLInputElement).value).toBe('/consentimiento/abc.def');
    expect(screen.getByText(/API_URL_PUBLICA/)).toBeTruthy();
  });

  it('sin aceptación del titular NO sincroniza: lo comprueba y lo dice', async () => {
    let sincronizaciones = 0;
    respuestas[`/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}`] = () =>
      json({ id: CONSENTIMIENTO, estado: 'rechazado' });
    respuestas[`/copropiedades/${COP}/biometria/plantillas/${PLANTILLA}/sincronizacion-total`] =
      () => {
        sincronizaciones += 1;
        return json({});
      };
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Comprobar respuesta/ }));
    await screen.findByText(/respondió «rechazado»/);
    expect(sincronizaciones).toBe(0);
  });

  it('con aceptación, sincroniza a todas y nombra cada terminal', async () => {
    respuestas[`/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}`] = () =>
      json({ id: CONSENTIMIENTO, estado: 'vigente' });
    respuestas[`/copropiedades/${COP}/biometria/plantillas/${PLANTILLA}/sincronizacion-total`] =
      () =>
        json({
          plantillaId: PLANTILLA,
          terminales: 2,
          sincronizadas: 1,
          fallidas: 1,
          porTerminal: [
            {
              dispositivoId: 't-1',
              nombre: 'Terminal peatonal',
              sincronizada: true,
              detalle: 'ok',
            },
            {
              dispositivoId: 'v-1',
              nombre: 'Videoportero',
              sincronizada: false,
              detalle: 'no respondió',
            },
          ],
        });
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Comprobar respuesta/ }));
    await waitFor(() => expect(screen.getByText(/1 de 2/)).toBeTruthy());
    expect(screen.getByText(/Terminal peatonal/)).toBeTruthy();
    expect(screen.getByText(/Videoportero · no respondió/)).toBeTruthy();
  });

  it('un fallo de la API se muestra, no se esconde', async () => {
    respuestas[`/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}/enlace`] = () =>
      json({ estado: 403, mensaje: 'Un consentimiento revocado ya no admite respuesta' }, 403);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Generar enlace para el titular/ }));
    await screen.findByRole('alert');
  });
});
