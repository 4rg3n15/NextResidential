import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SelectorDeCopropiedad } from '@/componentes/selector-copropiedad';
import { ErrorDeApi, cliente, desenvolver } from './api/cliente';
import { MENSAJE_CAMBIO_EN_CURSO, cambioDeCopropiedad } from './cambio-de-copropiedad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E1 · H-15K-01 · CAMBIAR DE COPROPIEDAD Y GUARDAR «EN EL ACTO»
 *
 * Del clic en el conmutador al final de la recarga, una escritura de la
 * consola NO sale a la red: se contesta 409 con un texto que se entiende. Las
 * lecturas siguen. Si guardar la elección falla, las escrituras vuelven.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const refrescar = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refrescar }) }));

let soltarCambio: (r: Response) => void = () => undefined;
const red: string[] = [];
beforeEach(() => {
  red.length = 0;
  cambioDeCopropiedad.terminar();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: Request | string) => {
      const url = typeof entrada === 'string' ? entrada : entrada.url;
      red.push(url);
      if (url.endsWith('/api/sesion/copropiedad')) {
        return new Promise<Response>((r) => {
          soltarCambio = r;
        });
      }
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const disponibles = [
  { id: A, nombre: 'Mirador' },
  { id: B, nombre: 'Roble' },
] as never;

const escribirEnA = () =>
  cliente.POST('/copropiedades/{id}/puertas/modos/reversion', {
    params: { path: { id: A } },
    body: { dispositivoId: A, numeroDePuerta: 1 },
  });

describe('E1 · las escrituras esperan al cambio de copropiedad', () => {
  it('durante el cambio, una escritura recibe 409 legible y NO sale a la red', async () => {
    render(<SelectorDeCopropiedad disponibles={disponibles} activa={A} alcanceGlobal={false} />);
    fireEvent.change(screen.getByLabelText('Copropiedad activa'), { target: { value: B } });
    expect((screen.getByLabelText('Copropiedad activa') as HTMLSelectElement).disabled).toBe(true);

    const r = await escribirEnA();
    expect(() => desenvolver(r)).toThrow(ErrorDeApi);
    expect(() => desenvolver(r)).toThrow(MENSAJE_CAMBIO_EN_CURSO);
    expect(r.response.status).toBe(409);
    expect(red.some((u) => u.includes('/puertas/'))).toBe(false);
  });

  it('las lecturas siguen durante el cambio', async () => {
    cambioDeCopropiedad.iniciar();
    const r = await cliente.GET('/copropiedades/{id}/puertas/modos', {
      params: { path: { id: A } },
    });
    expect(r.response.status).toBe(200);
  });

  it('al terminar la recarga, las escrituras vuelven a salir', async () => {
    render(<SelectorDeCopropiedad disponibles={disponibles} activa={A} alcanceGlobal={false} />);
    fireEvent.change(screen.getByLabelText('Copropiedad activa'), { target: { value: B } });
    await act(async () => {
      soltarCambio(new Response('{}', { status: 200 }));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(refrescar).toHaveBeenCalled());
    await vi.waitFor(() => expect(cambioDeCopropiedad.enCurso()).toBe(false));
    expect((await escribirEnA()).response.status).toBe(200);
  });

  it('si guardar la elección falla, las escrituras vuelven y se dice', async () => {
    render(<SelectorDeCopropiedad disponibles={disponibles} activa={A} alcanceGlobal={false} />);
    fireEvent.change(screen.getByLabelText('Copropiedad activa'), { target: { value: B } });
    await act(async () => {
      soltarCambio(new Response('{}', { status: 404 }));
      await Promise.resolve();
    });
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cambiar');
    expect(cambioDeCopropiedad.enCurso()).toBe(false);
  });
});
