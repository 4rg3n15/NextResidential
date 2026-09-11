import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InscripcionDeFactor } from './inscripcion-factor';
import { CodigosDeRecuperacion } from './codigos-recuperacion';

/**
 * Las dos pantallas que convierten «tiene un rol» en «puede entrar».
 *
 * Se prueban por el comportamiento que el titular ve, no por el estado interno:
 * que existe una vía para quien no puede escanear el QR, que el paso de códigos
 * no se despacha con un clic distraído, y que un fallo al generarlos no deja
 * fuera a quien ya tiene el factor verificado.
 */
let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchFalso = vi.fn(
    async () =>
      new Response(JSON.stringify({ qr: '<svg/>', secreto: 'JBSW Y3DP EHPK 3PXP' }), {
        status: 200,
      }),
  );
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

describe('inscripción del segundo factor', () => {
  it('ofrece el secreto en texto para quien no puede escanear el QR', async () => {
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} alYaInscrito={() => undefined} />);

    // El secreto no se muestra de entrada: en una portería la pantalla la ve
    // todo el que pasa. Se enseña cuando el titular lo pide.
    await waitFor(() => expect(screen.getByRole('img', { hidden: true })).toBeTruthy());
    expect(screen.queryByText(/JBSW Y3DP/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /no puedes escanear/i }));
    expect(screen.getByText(/JBSW Y3DP/)).toBeTruthy();
  });

  it('no envía ningún identificador de usuario: la identidad la pone el servidor', async () => {
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} alYaInscrito={() => undefined} />);
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit | undefined];
    expect(opciones?.body ?? '').toBe('');
  });

  it('un fallo del servidor se cuenta, no se traga', async () => {
    fetchFalso.mockResolvedValue(new Response(JSON.stringify({ mensaje: 'Vuelve a intentarlo.' }), { status: 503 }));
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} alYaInscrito={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Vuelve a intentarlo.'));
  });
});

describe('códigos de recuperación', () => {
  const conCodigos = (): void => {
    fetchFalso.mockResolvedValue(
      new Response(JSON.stringify({ codigos: ['AAAAA-BBBBB', 'CCCCC-DDDDD'], cantidad: 2 }), {
        status: 200,
      }),
    );
  };

  it('no deja continuar hasta que se confirma que se han guardado', async () => {
    conCodigos();
    const terminar = vi.fn();
    render(<CodigosDeRecuperacion alTerminar={terminar} />);

    const entrar = await screen.findByRole('button', { name: /entrar a la consola/i });
    fireEvent.click(entrar);
    expect(terminar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(entrar);
    expect(terminar).toHaveBeenCalledOnce();
  });

  it('dice que un código NO da acceso, que es lo que se malinterpreta', async () => {
    conCodigos();
    render(<CodigosDeRecuperacion alTerminar={() => undefined} />);
    expect((await screen.findByText(/no da acceso/i)).textContent).toBeTruthy();
  });

  it('si no se pueden generar, el titular entra igual: ya tiene el factor verificado', async () => {
    fetchFalso.mockResolvedValue(new Response('{}', { status: 500 }));
    const terminar = vi.fn();
    render(<CodigosDeRecuperacion alTerminar={terminar} />);

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /entrar a la consola/i }));
    expect(terminar).toHaveBeenCalledOnce();
  });
});

/**
 * EL FALLO QUE REPORTÓ EL CLIENTE, del lado de la pantalla.
 *
 * El servidor devolvió `503` y después `200` con el QR. La pantalla se quedó
 * con el mensaje rojo del primer intento y no pintó el código del segundo: un
 * fallo transitorio dejaba la inscripción imposible aunque el sistema
 * funcionara. Aquí se fijan las dos reglas que lo corrigen — **el último
 * intento manda** y **el éxito limpia el error**— y la salida que faltaba:
 * cuando no hay QR, hay un botón para reintentar y no un campo de código
 * inservible.
 */
const diferida = <T,>(): { promesa: Promise<T>; resolver: (v: T) => void } => {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
};

const conQr = (id = 'nuevo'): Response =>
  new Response(JSON.stringify({ qr: `<svg id="${id}"/>`, secreto: 'JBSW Y3DP' }), { status: 200 });

const conFallo = (): Response =>
  new Response(JSON.stringify({ mensaje: 'No se pudo contactar con el servicio de identidad.' }), {
    status: 503,
  });

describe('un fallo transitorio no deja la pantalla inservible', () => {
  it('sin QR no se muestra el campo de código: se muestra cómo reintentar', async () => {
    fetchFalso.mockResolvedValue(conFallo());
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} alYaInscrito={() => undefined} />);

    await screen.findByRole('alert');
    // Un campo donde teclear un código que no se puede obtener es la pantalla
    // que el cliente describió.
    expect(screen.queryByLabelText(/código de verificación/i)).toBeNull();
    expect(screen.getByRole('button', { name: /volver a intentarlo/i })).toBeTruthy();
  });

  it('el reintento con éxito BORRA el error y pinta el QR', async () => {
    fetchFalso.mockResolvedValueOnce(conFallo()).mockResolvedValue(conQr());
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} alYaInscrito={() => undefined} />);

    fireEvent.click(await screen.findByRole('button', { name: /volver a intentarlo/i }));

    await waitFor(() => expect(screen.getByRole('img', { hidden: true })).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('la respuesta TARDÍA de un intento superado no pinta su error sobre el QR', async () => {
    // El caso del cliente, tal cual: el modo estricto de React monta, limpia y
    // vuelve a montar, así que salen DOS peticiones. La que falla vuelve
    // después de la que funciona. Antes, esa respuesta tardía pintaba el
    // mensaje rojo encima de un QR perfectamente válido.
    const tardia = diferida<Response>();
    fetchFalso.mockReturnValueOnce(tardia.promesa).mockResolvedValue(conQr());
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} alYaInscrito={() => undefined} />, {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(screen.getByRole('img', { hidden: true })).toBeTruthy());
    expect(fetchFalso).toHaveBeenCalledTimes(2);

    tardia.resolver(conFallo());
    await new Promise((listo) => setTimeout(listo, 0));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('img', { hidden: true })).toBeTruthy();
  });
});
