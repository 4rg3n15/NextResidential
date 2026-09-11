import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectorioDeViviendas } from './viviendas/directorio';
import { PantallaDeVehiculos } from './vehiculos/pantalla';
import { PantallaDeVisitantes } from './visitantes/pantalla';
import { PantallaDeZonas } from './zonas/pantalla';
import { PantallaDeDispositivos } from './dispositivos/pantalla';
import { PantallaDeEventos } from './eventos/pantalla';
import { PantallaDeInformes } from './informes/pantalla';

/**
 * **Accesibilidad AA, la parte que una pantalla puede romper en silencio.**
 *
 * El contraste ya está medido y fijado en `packages/config` desde la 09-A, con
 * su prueba. Lo que faltaba es lo ESTRUCTURAL, que es donde una vista nueva se
 * degrada sin que nadie lo note: un `select` sin etiqueta, un botón cuyo único
 * contenido es un icono, dos `h1`, una tabla sin encabezados asociados.
 *
 * Se comprueba a mano y no con una biblioteca a propósito: lo que se afirma
 * aquí es exactamente lo que se comprueba, ni una casilla más. Y queda dicho lo
 * que NO cubre —foco visible, orden de tabulación real, lectura con un lector
 * de pantalla de verdad, contraste calculado sobre píxeles—: eso lo aporta el
 * navegador y se revisa a mano, como ya declara `src/pruebas/preparacion.ts`
 * para el `<dialog>`.
 */
const COP = '10000000-0000-4000-8000-000000000001';

/**
 * Las pantallas se pueblan **con datos**, y no es un detalle: una tabla vacía
 * no renderiza `<table>` —muestra su estado vacío— y una pantalla sin filas no
 * tiene la mitad de sus controles. Comprobar la accesibilidad sobre el estado
 * vacío habría dado verde sin mirar nada de lo que importa.
 */
const CON_DATOS = (url: string): Response => {
  const vivienda = {
    id: 'viv-1',
    identificador: 'Casa 12',
    manzana: null,
    direccion: null,
    estado: 'activo',
    estadoAdministrativo: 'al_dia',
    residentes: 1,
    vehiculos: 1,
    autorizacionesVigentes: 0,
    desactivadaEn: null,
    motivoDesactivacion: null,
  };
  const cuerpo = url.includes('/padron/viviendas')
    ? { totales: { activas: 1, inactivas: 0 }, viviendas: [vivienda] }
    : url.includes('/padron/vehiculos')
      ? [
          {
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
          },
        ]
      : url.includes('/autorizaciones')
        ? [
            {
              id: 'aut-1',
              viviendaId: 'viv-1',
              vivienda: 'Casa 12',
              visitante: 'Ana Pérez',
              documento: 'CC123',
              desde: '2026-09-10T08:00:00.000Z',
              hasta: '2026-09-11T08:00:00.000Z',
              tipo: 'unica',
              estado: 'activa',
              placa: null,
              acompanantes: [],
              patron: null,
              revocadaEn: null,
              motivoRevocacion: null,
            },
          ]
        : url.includes('/zonas')
          ? [
              {
                id: 'zon-1',
                nombre: 'Salón social',
                tipo: 'salon',
                abierta: true,
                politicaReinicio: 'diario',
                normas: [],
                aforoMaximo: 10,
                aforoActual: 2,
                aforoDisponible: 8,
                dentroDeHorario: true,
                aforoCompleto: false,
                horario: [],
                desplazamientoUtcMinutos: -300,
                reservasDelDia: [],
              },
            ]
          : url.includes('/dispositivos/pendientes')
            ? { dispositivos: [] }
            : url.includes('/tablero/dispositivos')
              ? {
                  dispositivos: [
                    {
                      id: 'dis-1',
                      nombre: 'Talanquera principal',
                      tipo: 'camara_lpr',
                      zonaId: null,
                      host: 'talanquera.equipo.invalid',
                      puerto: 80,
                      modelo: null,
                      firmware: null,
                      estado: 'saludable',
                      ultimoLatido: null,
                      ultimaSincronizacion: null,
                      segundosSinLatir: null,
                    },
                  ],
                  umbralSegundos: 300,
                }
              : url.includes('/eventos')
                ? {
                    filas: [
                      {
                        id: 'evt-1',
                        copropiedadId: COP,
                        ocurridoEn: '2026-09-10T10:00:00.000Z',
                        tipo: 'ingreso',
                        resultado: 'permitido',
                        motivo: null,
                        metodo: 'placa',
                        personaId: null,
                        viviendaId: null,
                        zonaId: null,
                        dispositivoId: 'dis-1',
                        placaDetectada: 'ABC123',
                        confianza: null,
                        reglaAplicada: 'vigencia',
                        versionReglas: 1,
                        operadorId: null,
                        motivoManual: null,
                        evidenciaId: null,
                        decididoPorEdge: false,
                      },
                    ],
                    siguiente: null,
                  }
                : [];
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
};

interface PantallaEnPrueba {
  readonly nombre: string;
  readonly montar: () => JSX.Element;
  /** Texto que solo aparece cuando los DATOS llegaron: sin esto se mide el esqueleto. */
  readonly senal: RegExp;
  /**
   * `false` en la única pantalla que es de solo lectura. Zonas comunes no tiene
   * ni un control: refleja aforo, horario y normas, y las acciones sobre una
   * zona son de la consola de portería (ETAPA 10). Exigirle controles habría
   * obligado a inventarle uno para que la prueba pasara.
   */
  readonly tieneControles?: boolean;
}

const PANTALLAS: readonly PantallaEnPrueba[] = [
  {
    nombre: 'viviendas',
    /**
     * La señal es el RESUMEN, no «Casa 12»: ese texto también está en la ayuda
     * del formulario de alta —«Como aparece en el conjunto: «Casa 12»»— y
     * aparece en el primer render. Esperar por él resolvía al instante y la
     * comprobación medía la pantalla ANTES de que llegaran los datos: la misma
     * carrera de aserción que ya se corrigió en el camino del navegador.
     */
    montar: () => <DirectorioDeViviendas copropiedadId={COP} />,
    senal: /1 activas/,
  },
  {
    nombre: 'vehículos',
    montar: () => <PantallaDeVehiculos copropiedadId={COP} />,
    senal: /ABC123/,
  },
  {
    nombre: 'visitantes',
    montar: () => <PantallaDeVisitantes copropiedadId={COP} />,
    senal: /Ana Pérez/,
  },
  {
    nombre: 'zonas comunes',
    montar: () => <PantallaDeZonas copropiedadId={COP} />,
    senal: /Salón social/,
    tieneControles: false,
  },
  {
    nombre: 'dispositivos',
    montar: () => <PantallaDeDispositivos copropiedadId={COP} />,
    senal: /Talanquera principal/,
  },
  { nombre: 'eventos', montar: () => <PantallaDeEventos copropiedadId={COP} />, senal: /placa/ },
  {
    nombre: 'informes',
    montar: () => <PantallaDeInformes copropiedadId={COP} />,
    senal: /Ningún informe generado todavía/,
  },
];

/** Monta y espera a que los datos estén en pantalla, no solo el encabezado. */
const montarConDatos = async (pantalla: PantallaEnPrueba): Promise<void> => {
  render(<Envoltura>{pantalla.montar()}</Envoltura>);
  await waitFor(() => expect(screen.getAllByText(pantalla.senal).length).toBeGreaterThan(0));
};

/** Nombre accesible de un control, por las vías que un lector usa de verdad. */
const nombreAccesible = (elemento: HTMLElement): string => {
  const etiquetado = elemento.getAttribute('aria-label');
  if (etiquetado !== null && etiquetado.trim() !== '') return etiquetado.trim();

  const porId = elemento.getAttribute('aria-labelledby');
  if (porId !== null) {
    const texto = porId
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (texto !== '') return texto;
  }
  if (elemento.id !== '') {
    const etiqueta = document.querySelector(`label[for="${elemento.id}"]`);
    if (etiqueta !== null && (etiqueta.textContent ?? '').trim() !== '') {
      return (etiqueta.textContent ?? '').trim();
    }
  }
  // Etiqueta implícita: el control envuelto por su `<label>`.
  const envolvente = elemento.closest('label');
  if (envolvente !== null && (envolvente.textContent ?? '').trim() !== '') {
    return (envolvente.textContent ?? '').trim();
  }
  const propio = (elemento.textContent ?? '').trim();
  if (propio !== '') return propio;
  return elemento.getAttribute('placeholder')?.trim() ?? '';
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: string | Request) =>
      CON_DATOS(typeof entrada === 'string' ? entrada : entrada.url),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cada control tiene un nombre que un lector de pantalla puede anunciar', () => {
  for (const pantalla of PANTALLAS.filter((p) => p.tieneControles !== false)) {
    it(`${pantalla.nombre}: ni un campo, botón o desplegable sin nombre`, async () => {
      await montarConDatos(pantalla);

      const controles = [
        ...document.querySelectorAll<HTMLElement>('input, select, textarea, button'),
      ].filter((c) => c.getAttribute('aria-hidden') !== 'true');

      const sinNombre = controles
        .filter((c) => nombreAccesible(c) === '')
        .map((c) => `${c.tagName.toLowerCase()}${c.getAttribute('type') ?? ''}`);

      expect(sinNombre).toEqual([]);
      // Y que haya controles que mirar: sobre una pantalla sin ninguno la
      // comprobación pasaría en vacío, que es la forma más silenciosa de no
      // comprobar nada. Por eso todas se pueblan con datos.
      expect(controles.length).toBeGreaterThan(0);
    });
  }
});

describe('la estructura del documento es navegable', () => {
  for (const pantalla of PANTALLAS) {
    it(`${pantalla.nombre}: exactamente un h1 y ningún tabindex positivo`, async () => {
      await montarConDatos(pantalla);

      expect(document.querySelectorAll('h1')).toHaveLength(1);
      // Un `tabindex` positivo reordena la navegación de TODA la página, no
      // solo la del componente que lo pone. Es el modo más rápido de romper el
      // orden de tabulación sin tocar nada más.
      const positivos = [...document.querySelectorAll('[tabindex]')].filter(
        (e) => Number(e.getAttribute('tabindex')) > 0,
      );
      expect(positivos).toEqual([]);
    });
  }
});

describe('las tablas se anuncian como tablas', () => {
  const CON_TABLA = ['viviendas', 'vehículos', 'dispositivos', 'eventos'];
  for (const pantalla of PANTALLAS.filter((p) => CON_TABLA.includes(p.nombre))) {
    it(`${pantalla.nombre}: encabezados de columna con ámbito y descripción`, async () => {
      await montarConDatos(pantalla);
      const tabla = screen.getByRole('table');

      // Sin `scope`, cada celda se anuncia sin decir de qué columna es: la
      // rejilla se ve igual y es ilegible con lector de pantalla.
      const encabezados = within(tabla).getAllByRole('columnheader');
      expect(encabezados.length).toBeGreaterThan(0);
      for (const th of encabezados) expect(th.getAttribute('scope')).toBe('col');

      // Y la tabla dice qué es antes de leerla.
      expect(tabla.querySelector('caption')).not.toBeNull();
    });
  }
});

describe('los avisos se anuncian solos', () => {
  it('el banner de alertas críticas es un `alert`, no un párrafo de color', async () => {
    // Un aviso que solo se distingue por el color no existe para quien no lo
    // ve, y este en concreto es el que dice que hay algo sin resolver (CA-18).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entrada: string | Request) => {
        const url = typeof entrada === 'string' ? entrada : entrada.url;
        if (url.includes('/alertas')) {
          return new Response(
            JSON.stringify([
              {
                id: 'a1',
                tipo: 'lista_negra',
                severidad: 'critica',
                estado: 'abierta',
                generadaEn: '2026-09-10T10:00:00.000Z',
                escaladaEn: null,
                eventoId: 'e1',
                dispositivoId: 'd1',
                escaladaDentroDelPlazo: true,
                notas: null,
              },
            ]),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return CON_DATOS(url);
      }),
    );
    render(
      <Envoltura>
        <PantallaDeEventos copropiedadId={COP} />
      </Envoltura>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });
});
