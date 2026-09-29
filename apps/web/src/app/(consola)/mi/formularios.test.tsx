import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PantallaDeMisVehiculos } from './vehiculos/pantalla';
import { PantallaDeMisVisitas } from './visitas/pantalla';
import { PantallaDeMiPerfil } from './perfil/pantalla';
import {
  AUTORIZACION_ID,
  COP,
  Envoltura,
  RESIDENTE_ID,
  VEHICULO_ID,
  escrituras,
  servidorFalso,
} from './pruebas';

/**
 * La foto la produce `CapturaDeFoto` con `createImageBitmap`, que jsdom no
 * tiene. Aquí se sustituye por un botón que entrega una foto ya medida: lo que
 * se prueba es el FORMULARIO —qué envía y cuándo se niega a enviar—, y la
 * captura tiene su verificación propia en la consola de visitantes.
 */
vi.mock('@/componentes/captura-de-foto', () => ({
  CapturaDeFoto: ({ alCambiar }: { alCambiar: (f: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        alCambiar({
          contenidoBase64: 'Zm90bw==',
          tipoMime: 'image/jpeg',
          medidas: { rostrosDetectados: 1, nitidez: 0.8, iluminacion: 0.5, proporcionRostro: 0.4 },
        })
      }
    >
      Foto de prueba
    </button>
  ),
}));

const VISITA_OK = {
  creada: true,
  id: AUTORIZACION_ID,
  repetida: false,
  motivo: null,
  explicacion: null,
  motivosDeFoto: [],
  equipos: 2,
  sincronizadas: 2,
  fallidas: 0,
  avisoDeSincronizacion: null,
};

let espia: ReturnType<typeof vi.fn>;
let respuestaDeEscritura: unknown = {};
beforeEach(() => {
  respuestaDeEscritura = {};
  espia = servidorFalso(() => respuestaDeEscritura);
  vi.stubGlobal('fetch', espia);
});
afterEach(() => vi.unstubAllGlobals());

/** El diálogo ABIERTO: la pantalla monta dos y sólo uno está en uso. */
const dialogo = (): ReturnType<typeof within> => {
  const abierto = document.querySelector<HTMLElement>('dialog[open]');
  if (abierto === null) throw new Error('no hay ningún diálogo abierto');
  return within(abierto);
};

const escribir = (etiqueta: RegExp | string, valor: string): void => {
  fireEvent.change(dialogo().getByLabelText(etiqueta), { target: { value: valor } });
};

const enviar = (nombre: string): HTMLButtonElement =>
  dialogo().getByRole('button', { name: nombre }) as HTMLButtonElement;

/** «Nuevo visitante» se habilita cuando llega `puedeAutorizar`: se espera a eso. */
const abrir = async (nombre: string): Promise<void> => {
  const boton = (await screen.findByRole('button', { name: nombre })) as HTMLButtonElement;
  await waitFor(() => expect(boton.disabled).toBe(false));
  fireEvent.click(boton);
};

describe('nuevo visitante (M-4)', () => {
  it('sin foto o sin casilla no envía nada, y lo dice; con todo, envía el cuerpo exacto sin ningún identificador', async () => {
    respuestaDeEscritura = VISITA_OK;
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    await abrir('Nuevo visitante');
    escribir(/Nombre del visitante/, 'Carla Ruiz');
    escribir(/Número de documento/, '12345678');
    escribir(/Fecha de la visita/, '2026-09-30');
    escribir(/Hora de llegada/, '15:30');
    escribir(/Placa \(opcional\)/, 'abc-123');
    escribir(/Observaciones/, 'Trae paquete');
    expect(enviar('Registrar visita').disabled).toBe(true);
    expect(dialogo().getByText(/Falta: una foto que sirva, marcar la casilla/)).toBeTruthy();
    fireEvent.click(dialogo().getByRole('button', { name: 'Foto de prueba' }));
    fireEvent.click(dialogo().getByLabelText(/Declaro que Carla Ruiz me autorizó a usar su foto/));
    expect(enviar('Registrar visita').disabled).toBe(false);
    fireEvent.click(enviar('Registrar visita'));
    await waitFor(async () => expect((await escrituras(espia)).length).toBe(1));
    const [e] = await escrituras(espia);
    expect(e?.ruta).toBe(`/copropiedades/${COP}/mi/visitas`);
    const cuerpo = e?.cuerpo as Record<string, unknown>;
    expect(cuerpo.nombre).toBe('Carla Ruiz');
    expect(cuerpo.documento).toBe('12345678');
    expect(cuerpo.inicio).toBe(new Date('2026-09-30T15:30:00').toISOString());
    expect(cuerpo.duracionMinutos).toBe(120);
    expect(cuerpo.placa).toBe('ABC123');
    expect(cuerpo.observaciones).toBe('Trae paquete');
    expect(cuerpo.casillaMarcada).toBe(true);
    expect(typeof cuerpo.claveDeIdempotencia).toBe('string');
    expect(Object.keys(cuerpo).sort()).toEqual([
      'casillaMarcada',
      'claveDeIdempotencia',
      'documento',
      'duracionMinutos',
      'foto',
      'inicio',
      'nombre',
      'observaciones',
      'placa',
    ]);
    expect(
      await screen.findByText(/Visita autorizada.*Foto enviada a 2 de 2 equipos/),
    ).toBeTruthy();
  });

  it('un rechazo de negocio llega como 200 con motivo y se pinta su explicación', async () => {
    respuestaDeEscritura = {
      ...VISITA_OK,
      creada: false,
      id: null,
      motivo: 'LISTA_NEGRA',
      explicacion: 'El visitante está en la lista negra del conjunto.',
    };
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    await abrir('Nuevo visitante');
    escribir(/Nombre del visitante/, 'Carla Ruiz');
    escribir(/Número de documento/, '12345678');
    fireEvent.click(dialogo().getByRole('button', { name: 'Foto de prueba' }));
    fireEvent.click(dialogo().getByLabelText(/Declaro que/));
    fireEvent.click(enviar('Registrar visita'));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'El visitante está en la lista negra del conjunto.',
    );
  });

  it('volver a autorizar: el visitante viaja en la ruta y sólo van fecha, hora, duración y casilla', async () => {
    respuestaDeEscritura = VISITA_OK;
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    await abrir('Volver a autorizar');
    expect(enviar('Autorizar de nuevo').disabled).toBe(true);
    fireEvent.click(dialogo().getByLabelText(/Declaro que Carla Ruiz me autorizó/));
    fireEvent.click(enviar('Autorizar de nuevo'));
    await waitFor(async () => expect((await escrituras(espia)).length).toBe(1));
    const [e] = await escrituras(espia);
    expect(e?.ruta).toBe(`/copropiedades/${COP}/mi/visitas/${AUTORIZACION_ID}/repeticion`);
    expect(Object.keys(e?.cuerpo as object).sort()).toEqual([
      'casillaMarcada',
      'claveDeIdempotencia',
      'duracionMinutos',
      'inicio',
    ]);
  });
});

describe('mis vehículos (M-3)', () => {
  it('registrar: exige un ocupante marcado y envía placa normalizada, datos, tipo y los ocupantes elegidos', async () => {
    respuestaDeEscritura = { registrado: true, id: VEHICULO_ID, motivo: null, explicacion: null };
    render(
      <Envoltura>
        <PantallaDeMisVehiculos copropiedadId={COP} />
      </Envoltura>,
    );
    await abrir('Registrar vehículo');
    escribir(/^Placa/, 'xyz 987');
    escribir(/^Color/, 'Rojo');
    escribir(/^Modelo/, 'Onix');
    escribir(/^Tipo/, 'motocicleta');
    expect(enviar('Registrar').disabled).toBe(true);
    fireEvent.click(await dialogo().findByLabelText('Ana Pérez'));
    fireEvent.click(enviar('Registrar'));
    await waitFor(async () => expect((await escrituras(espia)).length).toBe(1));
    const [e] = await escrituras(espia);
    expect(e?.ruta).toBe(`/copropiedades/${COP}/mi/vehiculos`);
    expect(e?.cuerpo).toEqual({
      placa: 'XYZ987',
      color: 'Rojo',
      modelo: 'Onix',
      marca: null,
      tipo: 'motocicleta',
      ocupantes: [RESIDENTE_ID],
    });
  });

  it('el tope de vehículos se explica y remite a la administración', async () => {
    respuestaDeEscritura = {
      registrado: false,
      id: null,
      motivo: 'TOPE_ALCANZADO',
      explicacion: 'Tu vivienda ya tiene los vehículos que admite.',
    };
    render(
      <Envoltura>
        <PantallaDeMisVehiculos copropiedadId={COP} />
      </Envoltura>,
    );
    await abrir('Registrar vehículo');
    escribir(/^Placa/, 'XYZ987');
    escribir(/^Color/, 'Rojo');
    escribir(/^Modelo/, 'Onix');
    fireEvent.click(await dialogo().findByLabelText('Ana Pérez'));
    fireEvent.click(enviar('Registrar'));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'pídeselo a la administración',
    );
  });

  it('dar de baja: el vehículo viaja en la ruta, sin cuerpo', async () => {
    respuestaDeEscritura = { desactivado: true };
    render(
      <Envoltura>
        <PantallaDeMisVehiculos copropiedadId={COP} />
      </Envoltura>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Dar de baja' }).at(-1)!);
    await waitFor(async () => expect((await escrituras(espia)).length).toBe(1));
    const [e] = await escrituras(espia);
    expect(e?.ruta).toBe(`/copropiedades/${COP}/mi/vehiculos/${VEHICULO_ID}/desactivacion`);
    expect(e?.cuerpo).toBeNull();
  });
});

describe('mi perfil (M-8)', () => {
  it('editar: precarga lo guardado y envía los siete campos por PUT', async () => {
    respuestaDeEscritura = { guardado: true, perfil: null, motivo: null, campos: [] };
    render(
      <Envoltura>
        <PantallaDeMiPerfil copropiedadId={COP} />
      </Envoltura>,
    );
    await abrir('Editar');
    expect((dialogo().getByLabelText('Nombres') as HTMLInputElement).value).toBe('Ana');
    escribir('Teléfono', '+57 300 999 8877');
    fireEvent.click(enviar('Guardar'));
    await waitFor(async () => expect((await escrituras(espia)).length).toBe(1));
    const [e] = await escrituras(espia);
    expect(e?.metodo).toBe('PUT');
    expect(e?.ruta).toBe(`/copropiedades/${COP}/mi/perfil`);
    expect(e?.cuerpo).toEqual({
      nombres: 'Ana',
      apellidos: 'Pérez',
      fechaNacimiento: '1990-05-17',
      tipoDocumento: 'cedula',
      numeroDocumento: '10203040',
      correo: 'ana@correo.invalid',
      telefono: '+57 300 999 8877',
    });
  });

  it('un rechazo por campo se pone debajo de SU campo', async () => {
    respuestaDeEscritura = {
      guardado: false,
      perfil: null,
      motivo: 'DOCUMENTO_EN_USO',
      campos: [{ campo: 'numeroDocumento', motivo: 'Ya está registrado a nombre de otra persona' }],
    };
    render(
      <Envoltura>
        <PantallaDeMiPerfil copropiedadId={COP} />
      </Envoltura>,
    );
    await abrir('Editar');
    fireEvent.click(enviar('Guardar'));
    const campo = await dialogo().findByLabelText('Número de documento');
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Ya está registrado a nombre de otra persona')).toBeTruthy();
  });
});
