import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectorioDeViviendas } from './viviendas/directorio';
import { PantallaDeVehiculos } from './vehiculos/pantalla';
import { PantallaDeVisitantes } from './visitantes/pantalla';
import { PantallaDeZonas } from './zonas/pantalla';
import { PantallaDeDispositivos } from './dispositivos/pantalla';
import { PantallaDeEventos } from './eventos/pantalla';
import { PantallaDeInformes } from './informes/pantalla';

/**
 * **Las siete pantallas se MONTAN de verdad.**
 *
 * Hasta esta suite ninguna se renderizaba en ninguna prueba: compilaban, y eso
 * era todo lo que se sabía de ellas. TypeScript no ve un `map` sobre un campo
 * que llega `null`, ni un `toLocaleString` sobre una fecha ausente, ni un
 * componente que se cae al primer render — y este proyecto ya ha pagado siete
 * veces la diferencia entre «hay una prueba» y «se ha ejercitado».
 *
 * Lo que se afirma aquí no es la maquetación: es que la pantalla **se pinta con
 * datos y sin datos**, y que dice lo que el requisito la obliga a decir.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const respuesta = (cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const VIVIENDA = {
  id: 'viv-1',
  identificador: 'Casa 12',
  manzana: 'B',
  direccion: null,
  estado: 'inactivo',
  estadoAdministrativo: 'al_dia',
  residentes: 3,
  vehiculos: 2,
  autorizacionesVigentes: 2,
  desactivadaEn: '2026-09-01T10:00:00.000Z',
  motivoDesactivacion: 'Vivienda desocupada',
};

const VEHICULO = {
  id: 'veh-1',
  placa: 'ABC123',
  marca: 'Mazda',
  modelo: '3',
  color: 'Gris',
  tipo: 'automovil',
  estado: 'activo',
  viviendaId: 'viv-1',
  viviendaIdentificador: 'Casa 12',
  propietarioId: null,
  propietarioNombre: null,
};

const AUTORIZACION = {
  id: 'aut-1',
  viviendaId: 'viv-1',
  vivienda: 'Casa 12',
  visitante: 'Ana Pérez',
  documento: 'CC123',
  desde: '2026-09-10T08:00:00.000Z',
  hasta: '2026-09-11T08:00:00.000Z',
  tipo: 'recurrente',
  estado: 'activa',
  placa: 'XYZ789',
  acompanantes: ['Luis Gómez'],
  patron: { dias: [1, 3], horaInicio: '08:00', horaFin: '18:00' },
  revocadaEn: null,
  motivoRevocacion: null,
};

const ZONA = {
  id: 'zon-1',
  nombre: 'Salón social',
  tipo: 'salon',
  abierta: true,
  politicaReinicio: 'diario',
  normas: ['Sin mascotas'],
  aforoMaximo: 20,
  aforoActual: 18,
  aforoDisponible: 2,
  dentroDeHorario: true,
  aforoCompleto: false,
  horario: [
    { dia: 6, minutoInicio: 1320, minutoFin: 1440, continuaDelDiaAnterior: false },
    { dia: 0, minutoInicio: 0, minutoFin: 120, continuaDelDiaAnterior: true },
  ],
  desplazamientoUtcMinutos: -300,
  reservasDelDia: [],
};

const DISPOSITIVO = {
  id: 'dis-1',
  nombre: 'Talanquera principal',
  tipo: 'camara_lpr',
  zonaId: null,
  host: '10.0.0.5',
  puerto: 80,
  modelo: 'Modelo X',
  firmware: 'v1.2',
  estado: 'saludable',
  ultimoLatido: '2026-09-10T10:00:00.000Z',
  ultimaSincronizacion: '2026-09-10T09:00:00.000Z',
  segundosSinLatir: 30,
};

const EVENTO = {
  id: 'evt-1',
  copropiedadId: COP,
  ocurridoEn: '2026-09-10T10:00:00.000Z',
  tipo: 'ingreso',
  resultado: 'negado',
  motivo: 'LISTA_NEGRA',
  metodo: 'placa',
  personaId: null,
  viviendaId: null,
  zonaId: null,
  dispositivoId: 'dis-1',
  placaDetectada: 'ABC123',
  confianza: 0.9,
  reglaAplicada: 'listaNegra',
  versionReglas: 3,
  operadorId: null,
  motivoManual: null,
  evidenciaId: null,
  decididoPorEdge: true,
};

/**
 * Enruta por URL: cada pantalla pide lo suyo y ninguna se entera de las demás.
 * El primer argumento puede llegar como cadena o como `Request` —depende de
 * cómo lo construya el cliente generado—, así que se normaliza en vez de
 * suponer una de las dos formas.
 */
const servidorFalso = (): ReturnType<typeof vi.fn> =>
  vi.fn(async (entrada: string | Request) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    if (url.includes('/padron/viviendas')) {
      return respuesta({ totales: { activas: 4, inactivas: 1 }, viviendas: [VIVIENDA] });
    }
    if (url.includes('/padron/vehiculos')) return respuesta([VEHICULO]);
    if (url.includes('/autorizaciones')) return respuesta([AUTORIZACION]);
    if (url.includes('/zonas')) return respuesta([ZONA]);
    if (url.includes('/dispositivos/pendientes')) return respuesta({ dispositivos: ['dis-1'] });
    if (url.includes('/tablero/dispositivos')) {
      return respuesta({ dispositivos: [DISPOSITIVO], umbralSegundos: 300 });
    }
    if (url.includes('/alertas')) {
      return respuesta([
        {
          id: 'ale-1',
          tipo: 'lista_negra',
          severidad: 'critica',
          estado: 'abierta',
          generadaEn: '2026-09-10T10:00:00.000Z',
          escaladaEn: null,
          eventoId: 'evt-1',
          dispositivoId: 'dis-1',
          escaladaDentroDelPlazo: true,
          notas: null,
        },
      ]);
    }
    if (url.includes('/eventos')) return respuesta({ filas: [EVENTO], siguiente: null });
    return respuesta({});
  });

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
};

const montar = (elemento: JSX.Element): void => {
  render(<Envoltura>{elemento}</Envoltura>);
};

beforeEach(() => {
  vi.stubGlobal('fetch', servidorFalso());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('viviendas', () => {
  it('muestra los totales y NO esconde que una inactiva conserva autorizaciones (RN-13)', async () => {
    montar(<DirectorioDeViviendas copropiedadId={COP} />);
    await waitFor(() => expect(screen.getByText('Casa 12')).toBeDefined());
    expect(screen.getByText('4 activas')).toBeDefined();
    // La frase que impide leer «inactiva» como «ya no entra nadie».
    expect(screen.getByText(/siguen abriendo/i)).toBeDefined();
  });
});

describe('vehículos', () => {
  it('pinta la placa y su vivienda', async () => {
    montar(<PantallaDeVehiculos copropiedadId={COP} />);
    await waitFor(() => expect(screen.getByText('ABC123')).toBeDefined());
    expect(screen.getAllByText('Casa 12').length).toBeGreaterThan(0);
  });
});

describe('visitantes', () => {
  it('una recurrente ENSEÑA su patrón; sin él sería indistinguible de una que abre siempre', async () => {
    montar(<PantallaDeVisitantes copropiedadId={COP} />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeDefined());
    expect(screen.getByText(/Lun, Mié · 08:00–18:00/)).toBeDefined();
    expect(screen.getByText(/Luis Gómez/)).toBeDefined();
  });
});

describe('zonas comunes', () => {
  it('la franja que cruza medianoche se declara como continuación', async () => {
    montar(<PantallaDeZonas copropiedadId={COP} />);
    await waitFor(() => expect(screen.getByText('Salón social')).toBeDefined());
    expect(screen.getByText(/viene del día anterior/)).toBeDefined();
    // Y el vacío de reservas se EXPLICA en vez de mostrar «0 reservas».
    expect(screen.getByText(/módulo de reservas no está construido/)).toBeDefined();
  });
});

describe('dispositivos', () => {
  it('muestra inventario y estado «sincronizando» cuando hay una orden encolada', async () => {
    montar(<PantallaDeDispositivos copropiedadId={COP} />);
    await waitFor(() => expect(screen.getByText('Talanquera principal')).toBeDefined());
    expect(screen.getByText('10.0.0.5:80')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Sincronizando')).toBeDefined());
  });

  it('NO aparece ninguna credencial ni referencia a bóveda (RN-21)', async () => {
    montar(<PantallaDeDispositivos copropiedadId={COP} />);
    await waitFor(() => expect(screen.getByText('Talanquera principal')).toBeDefined());
    // Se mira la TABLA, no la página entera: el encabezado explica —en
    // español— que las credenciales no salen de la API, y esa frase contiene
    // la palabra. Lo que no puede aparecer es una credencial o su referencia
    // de bóveda entre los datos del equipo.
    const tabla = screen.getByRole('table').textContent ?? '';
    expect(tabla).not.toMatch(/vault:|env:|contrase|secret|password/i);
    expect(tabla).toContain('10.0.0.5');
  });
});

describe('eventos', () => {
  it('el banner de alertas críticas se pinta y el evento trae su motivo', async () => {
    montar(<PantallaDeEventos copropiedadId={COP} />);
    await waitFor(() => expect(screen.getByText(/1 alerta sin resolver/)).toBeDefined());
    expect(screen.getByText('LISTA_NEGRA')).toBeDefined();
    expect(screen.getByText(/Edge \(autónomo\)/)).toBeDefined();
  });
});

describe('informes', () => {
  it('no genera nada al abrir: lo dice y espera a que se pida', () => {
    montar(<PantallaDeInformes copropiedadId={COP} />);
    expect(screen.getByText(/Ningún informe generado todavía/)).toBeDefined();
    // Y no ha llamado a la API: el informe es una consulta cara.
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});
