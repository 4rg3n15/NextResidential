import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InvitacionDelRostro } from './invitacion-del-rostro';
import { COP, Envoltura, RESPUESTAS, respuesta, servidorFalso } from './pruebas';
import { claveDeAhoraNo } from '@/lib/rostro';

const CUENTA = 'u-1';
const montar = () =>
  render(
    <Envoltura>
      <InvitacionDelRostro copropiedadId={COP} cuenta={CUENTA}>
        <p>Mi vivienda (contenido)</p>
      </InvitacionDelRostro>
    </Envoltura>,
  );

let espia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  espia = servidorFalso();
  vi.stubGlobal('fetch', espia);
});
afterEach(() => vi.unstubAllGlobals());

describe('la invitación del rostro en el primer ingreso (15-Y3)', () => {
  it('sin rostro y sin «Ahora no», invita; «Registrar mi rostro» lleva a /mi/rostro', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Entre con su rostro' })).toBeTruthy();
    expect(screen.queryByText('Mi vivienda (contenido)')).toBeNull();
    expect(screen.getByRole('link', { name: 'Registrar mi rostro' }).getAttribute('href')).toBe(
      '/mi/rostro',
    );
  });

  it('«Ahora no» se recuerda para esta cuenta y deja pasar; la próxima vez ni pregunta', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Ahora no' }));
    expect(screen.getByText('Mi vivienda (contenido)')).toBeTruthy();
    expect(localStorage.getItem(claveDeAhoraNo(CUENTA))).toBe('si');
    const llamadas = espia.mock.calls.length;
    const otra = render(
      <Envoltura>
        <InvitacionDelRostro copropiedadId={COP} cuenta={CUENTA}>
          <p>Otra vez</p>
        </InvitacionDelRostro>
      </Envoltura>,
    );
    expect(otra.getByText('Otra vez')).toBeTruthy();
    expect(espia.mock.calls.length).toBe(llamadas);
  });

  it('con rostro registrado no invita; si la API falla, se entra sin la invitación', async () => {
    const activo = vi.fn(async () =>
      respuesta({
        ...(RESPUESTAS[`/api/ncr/copropiedades/${COP}/mi/rostro`] as object),
        estado: 'activa',
      }),
    );
    vi.stubGlobal('fetch', activo);
    const a = montar();
    await waitFor(() => expect(screen.getByText('Mi vivienda (contenido)')).toBeTruthy());
    a.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    montar();
    await waitFor(() => expect(screen.getByText('Mi vivienda (contenido)')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Entre con su rostro' })).toBeNull();
  });
});
