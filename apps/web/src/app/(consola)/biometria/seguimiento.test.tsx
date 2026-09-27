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
      versionPolitica="v1"
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
    // Sin URL pública no hay QR que valga: un QR de una ruta relativa no abre nada.
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
  });

  it('con API_URL_PUBLICA muestra el QR del enlace, de un solo uso (BE-01: sin correo)', async () => {
    respuestas[`/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}/enlace`] = () =>
      json({
        consentimientoId: CONSENTIMIENTO,
        estado: 'pendiente',
        token: 'abc.def',
        ruta: '/consentimiento/abc.def',
        url: 'http://consola.invalid:3000/consentimiento/abc.def',
        expiraEn: new Date(Date.now() + 3_600_000).toISOString(),
      });
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Generar enlace para el titular/ }));
    const qr = await screen.findByRole('img', { name: /Código QR del enlace del titular/ });
    expect(Number(qr.getAttribute('data-modulos'))).toBeGreaterThanOrEqual(21);
    expect(qr.querySelectorAll('rect').length).toBeGreaterThan(50);
    expect(screen.getByText(/un solo uso/)).toBeTruthy();
  });

  it('H-SITIO-10 · con una URL de bucle local AVISA que ningún otro aparato la abre', async () => {
    respuestas[`/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}/enlace`] = () =>
      json({
        consentimientoId: CONSENTIMIENTO,
        estado: 'pendiente',
        token: 'abc.def',
        ruta: '/consentimiento/abc.def',
        url: 'http://127.0.0.1:3000/consentimiento/abc.def',
        alcance: 'bucle_local',
        expiraEn: new Date(Date.now() + 3_600_000).toISOString(),
      });
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Generar enlace para el titular/ }));
    const aviso = await screen.findByText(/NO se abre desde otro aparato/);
    expect(aviso.getAttribute('role')).toBe('alert');
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
          omitidas: [
            {
              dispositivoId: 'v-2',
              nombre: 'Videoportero de servicio',
              detalle: 'este equipo no admite rostros',
            },
          ],
        });
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Comprobar respuesta/ }));
    await waitFor(() => expect(screen.getByText(/1 de 2/)).toBeTruthy());
    expect(screen.getByText(/Terminal peatonal/)).toBeTruthy();
    expect(screen.getByText(/Videoportero · no respondió/)).toBeTruthy();
    // A3 (15-L) · el omitido se nombra, con su porqué: nada queda en silencio.
    expect(screen.getByText('Omitido')).toBeTruthy();
    expect(
      screen.getByText(/Videoportero de servicio · este equipo no admite rostros/),
    ).toBeTruthy();
  });

  it('un fallo de la API se muestra, no se esconde', async () => {
    respuestas[`/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}/enlace`] = () =>
      json({ estado: 403, mensaje: 'Un consentimiento revocado ya no admite respuesta' }, 403);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Generar enlace para el titular/ }));
    await screen.findByRole('alert');
  });

  describe('D-10 · consentimiento presencial: lo llena el TITULAR', () => {
    const RUTA = `/copropiedades/${COP}/biometria/consentimientos/${CONSENTIMIENTO}/aceptacion-presencial`;
    const abrir = (): HTMLFormElement => {
      fireEvent.click(screen.getByRole('button', { name: /El titular está aquí/ }));
      return screen.getByRole('form', { name: /Consentimiento presencial del titular/ });
    };
    const cuerpoEnviado = async (): Promise<Record<string, unknown>> => {
      const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const peticion = (espia.mock.calls as [Request][])
        .map(([r]) => r)
        .find((r) => r instanceof Request && r.url.endsWith('/aceptacion-presencial'));
      if (peticion === undefined) throw new Error('no se envió');
      return (await peticion.clone().json()) as Record<string, unknown>;
    };

    it('los campos llegan VACÍOS y el envío exige nombre, documento y la declaración', () => {
      montar();
      const formulario = abrir();
      const nombre = screen.getByLabelText('Su nombre completo') as HTMLInputElement;
      const documento = screen.getByLabelText('Su número de documento') as HTMLInputElement;
      expect(nombre.value).toBe('');
      expect(documento.value).toBe('');
      expect(formulario.textContent).toContain('versión v1');
      const enviar = screen.getByRole('button', { name: 'Registrar mi consentimiento' });
      expect((enviar as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(nombre, { target: { value: 'Visitante Uno' } });
      fireEvent.change(documento, { target: { value: '10203040' } });
      expect((enviar as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('checkbox'));
      expect((enviar as HTMLButtonElement).disabled).toBe(false);
    });

    it('envía lo escrito con la versión mostrada, sincroniza y vacía el formulario', async () => {
      respuestas[RUTA] = () =>
        json(
          {
            estado: 'vigente',
            propagacion: [
              {
                plantillaId: PLANTILLA,
                terminales: 2,
                sincronizadas: 2,
                fallidas: 0,
                porTerminal: [],
              },
            ],
          },
          201,
        );
      montar();
      abrir();
      fireEvent.change(screen.getByLabelText('Su nombre completo'), {
        target: { value: 'Visitante Uno' },
      });
      fireEvent.change(screen.getByLabelText('Su número de documento'), {
        target: { value: '10.203.040' },
      });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Registrar mi consentimiento' }));
      await waitFor(() => expect(screen.getByText(/2 de 2/)).toBeTruthy());
      expect(await cuerpoEnviado()).toEqual({
        nombreCompleto: 'Visitante Uno',
        numeroDocumento: '10.203.040',
        versionPolitica: 'v1',
        aceptaPolitica: true,
      });
      // Vigente: el formulario se cierra y el documento no queda en pantalla.
      expect(screen.queryByLabelText('Su número de documento')).toBeNull();
      expect(screen.queryByRole('button', { name: /El titular está aquí/ })).toBeNull();
    });

    it('si no coincide con el titular, lo dice y NO se cierra', async () => {
      respuestas[RUTA] = () =>
        json({ estado: 403, mensaje: 'El nombre o el documento escritos no coinciden' }, 403);
      montar();
      abrir();
      fireEvent.change(screen.getByLabelText('Su nombre completo'), {
        target: { value: 'Otra Persona' },
      });
      fireEvent.change(screen.getByLabelText('Su número de documento'), {
        target: { value: '99999999' },
      });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Registrar mi consentimiento' }));
      await screen.findByRole('alert');
      expect(screen.getByLabelText('Su número de documento')).toBeTruthy();
    });
  });
});
