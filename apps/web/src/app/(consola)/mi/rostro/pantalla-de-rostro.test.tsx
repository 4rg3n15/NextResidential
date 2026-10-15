import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PantallaDeRostro } from './pantalla-de-rostro';
import {
  COP,
  Envoltura,
  MENOR_ID,
  RESPUESTAS,
  VERSION_POLITICA_ROSTRO,
  conCodigo,
  escrituras,
  respuesta,
  servidorFalso,
} from '../pruebas';

const FOTO = {
  contenidoBase64: 'Zm90bw==',
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.8, iluminacion: 0.5, proporcionRostro: 0.4 },
};

/** La captura real abre la cámara o lee un fichero: aquí un botón entrega una foto ya medida. */
vi.mock('@/componentes/captura-de-rostro', () => ({
  CapturaDeRostro: ({ alCambiar }: { alCambiar: (f: unknown) => void }) => (
    <button type="button" onClick={() => alCambiar(FOTO)}>
      Foto de prueba
    </button>
  ),
}));

const ROSTRO = RESPUESTAS[`/api/ncr/copropiedades/${COP}/mi/rostro`] as Record<string, unknown>;

const montar = (menor: { residenteId: string; nombre: string } | null = null) =>
  render(
    <Envoltura>
      <PantallaDeRostro copropiedadId={COP} menor={menor} />
    </Envoltura>,
  );

let espia: ReturnType<typeof vi.fn>;
let respuestaDeEscritura: unknown = {};
beforeEach(() => {
  respuestaDeEscritura = { ...ROSTRO, estado: 'pendiente', politica: undefined };
  espia = servidorFalso(() => respuestaDeEscritura);
  vi.stubGlobal('fetch', espia);
});
afterEach(() => vi.unstubAllGlobals());

describe('«Mi rostro» en la consola (15-Y3)', () => {
  it('los cinco estados: cargando, error, sin permiso, sin conexión y sin rostro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    const { unmount } = montar();
    expect(screen.getByRole('status').textContent).toMatch(/Cargando tu rostro/);
    unmount();
    vi.stubGlobal('fetch', conCodigo(503));
    const e = montar();
    await waitFor(() => expect(screen.getByText('Servicio no disponible por ahora')).toBeTruthy());
    e.unmount();
    vi.stubGlobal('fetch', conCodigo(403));
    const s = montar();
    await waitFor(() => expect(screen.getByText('Sin permiso')).toBeTruthy());
    s.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const c = montar();
    await waitFor(() => expect(screen.getByText('Sin conexión con el servidor')).toBeTruthy());
    c.unmount();
    vi.stubGlobal('fetch', espia);
    montar();
    await waitFor(() =>
      expect(
        screen.getByText('No ha registrado su rostro. Es opcional: puede entrar sin él.'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Terminal de la portería')).toBeTruthy();
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retirar mi rostro' })).toBeNull();
  });

  it('registrar exige foto y casilla, envía la versión de la política y lo dice', async () => {
    montar();
    const registrar = await screen.findByRole('button', { name: 'Registrar mi rostro' });
    expect((registrar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Foto de prueba' }));
    expect((registrar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Leí y acepto la política del tratamiento de mi rostro'));
    expect((registrar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(registrar);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Listo: su rostro quedó registrado.'),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/rostro`,
      cuerpo: { ...FOTO, versionPolitica: VERSION_POLITICA_ROSTRO, aceptaPolitica: true },
    });
  });

  it('una política nueva desmarca la casilla: hay que leerla otra vez', async () => {
    let version = VERSION_POLITICA_ROSTRO;
    const servidor = vi.fn(async (entrada: string | Request) => {
      const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
      if (p.method === 'POST') {
        version = 'rostro-2';
        return respuesta(
          {
            estado: 409,
            mensaje: {
              message: 'La política del rostro cambió: léala y acéptela de nuevo',
              codigo: 'POLITICA_CAMBIADA',
            },
          },
          409,
        );
      }
      return respuesta({ ...ROSTRO, politica: { version, texto: `Texto ${version}` } });
    });
    vi.stubGlobal('fetch', servidor);
    montar();
    const casilla = (await screen.findByLabelText(/Leí y acepto la política/)) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Foto de prueba' }));
    fireEvent.click(casilla);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar mi rostro' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/La política del rostro cambió/),
    );
    await waitFor(() => expect(screen.getByText('Texto rostro-2')).toBeTruthy());
    expect((screen.getByLabelText(/Leí y acepto la política/) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('retirar confirma sin motivo, llama al retiro y lo dice', async () => {
    const activo = vi.fn(async (entrada: string | Request) => {
      const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
      if (p.method === 'POST')
        return respuesta({ ...ROSTRO, estado: 'en_retiro', politica: undefined });
      return respuesta({
        ...ROSTRO,
        estado: 'activa',
        equiposConMiRostro: 1,
        registradoEn: '2026-10-01T12:00:00.000Z',
        venceEn: '2027-10-01T12:00:00.000Z',
      });
    });
    vi.stubGlobal('fetch', activo);
    montar();
    expect(await screen.findByText('Activo: el equipo de la portería lo reconoce.')).toBeTruthy();
    expect(screen.getByText(/Registrado el 01-10-2026 · vence el 01-10-2027/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renovar mi rostro' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar mi rostro' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Retirar su rostro?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retirar' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Su rostro se retiró.'),
    );
    const [e] = await escrituras(activo);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/rostro/retiro`,
      cuerpo: null,
    });
  });

  it('el de un menor: su título, las dos declaraciones de ADR-039 y su ruta', async () => {
    montar({ residenteId: MENOR_ID, nombre: 'Sofía Pérez' });
    expect(await screen.findByRole('heading', { name: 'Rostro de Sofía Pérez' })).toBeTruthy();
    const registrar = await screen.findByRole('button', { name: 'Registrar su rostro' });
    fireEvent.click(screen.getByRole('button', { name: 'Foto de prueba' }));
    fireEvent.click(screen.getByLabelText(/Leí y acepto, como su representante/));
    expect((registrar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Soy su representante legal'));
    fireEvent.click(screen.getByLabelText('Le expliqué para qué es su rostro y está de acuerdo'));
    expect((registrar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(registrar);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Listo: su rostro quedó registrado.'),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/menores/${MENOR_ID}/rostro`,
      cuerpo: {
        ...FOTO,
        versionPolitica: 'menor-1',
        aceptaPolitica: true,
        declaraRepresentacionLegal: true,
        menorInformadoYDeAcuerdo: true,
      },
    });
  });
});
