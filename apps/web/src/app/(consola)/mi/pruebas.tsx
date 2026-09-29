import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Datos de prueba de las pantallas del residente (15-M): un servidor falso por ruta exacta. */
export const COP = '10000000-0000-4000-8000-000000000001';
export const VEHICULO_ID = '50000000-0000-4000-8000-0000000000c1';
export const AUTORIZACION_ID = '60000000-0000-4000-8000-0000000000d1';
export const RESIDENTE_ID = '20000000-0000-4000-8000-0000000000a1';

export const HOGAR = {
  vivienda: {
    id: '30000000-0000-4000-8000-000000000042',
    identificador: '42',
    agrupacion: 'B',
    etiquetaVivienda: 'Casa',
    etiquetaAgrupacion: 'Manzana',
    direccion: 'Kilómetro 4 vía La Calera',
    copropiedadNombre: 'Urbanización Mira',
    estadoAdministrativo: 'al_dia',
    activa: true,
  },
  vinculo: { residenteId: RESIDENTE_ID, esTitular: true, nivelAcceso: 'acceso_completo' },
  puedeAutorizar: true,
};

export const RESPUESTAS: Readonly<Record<string, unknown>> = {
  [`/api/ncr/copropiedades/${COP}/mi/vivienda`]: HOGAR,
  [`/api/ncr/copropiedades/${COP}/mi/familia`]: [
    {
      residenteId: RESIDENTE_ID,
      nombre: 'Ana Pérez',
      parentesco: null,
      esTitular: true,
      nivelAcceso: 'acceso_completo',
      activo: true,
    },
    {
      residenteId: '20000000-0000-4000-8000-0000000000a2',
      nombre: 'Luis Pérez',
      parentesco: 'Hijo',
      esTitular: false,
      nivelAcceso: 'solo_ingreso',
      activo: false,
    },
  ],
  [`/api/ncr/copropiedades/${COP}/mi/vehiculos`]: [
    {
      id: VEHICULO_ID,
      placa: 'RES123',
      marca: 'Mazda',
      modelo: '3',
      color: 'Gris',
      esPrincipal: true,
      activo: true,
    },
  ],
  [`/api/ncr/copropiedades/${COP}/mi/autorizaciones`]: [
    {
      id: AUTORIZACION_ID,
      visitante: 'Carla Ruiz',
      tipo: 'puntual',
      desde: '2026-09-29T14:00:00.000Z',
      hasta: '2026-09-29T16:00:00.000Z',
      placa: 'VIS456',
      permiteAccesoVehicular: true,
      estado: 'activa',
      acompanantes: 1,
      situacion: 'rechazada',
      motivoRechazo: 'No coincide la foto',
    },
  ],
  [`/api/ncr/copropiedades/${COP}/mi/visitas/ultimas`]: [
    {
      autorizacionId: AUTORIZACION_ID,
      visitante: 'Carla Ruiz',
      documento: '12345678',
      ultimaVisita: '2026-09-20T15:00:00.000Z',
      placa: null,
      tieneFoto: true,
    },
  ],
  [`/api/ncr/copropiedades/${COP}/mi/zonas`]: [
    {
      id: '70000000-0000-4000-8000-0000000000e1',
      nombre: 'Piscina',
      aforoMaximo: 20,
      ocupacionActual: 18,
      abiertaAhora: true,
      franjasDeHoy: [{ desde: '2026-09-29T13:00:00.000Z', hasta: '2026-09-29T23:00:00.000Z' }],
      requiereAutorizacion: true,
    },
  ],
  [`/api/ncr/copropiedades/${COP}/mi/historial`]: [
    {
      id: '80000000-0000-4000-8000-0000000000f1',
      ocurridoEn: '2026-09-29T14:05:00.000Z',
      tipo: 'acceso',
      resultado: 'negado',
      motivo: 'LISTA_NEGRA',
      metodo: 'placa',
      placaDetectada: 'VIS456',
      persona: 'Carla Ruiz',
      zona: 'Entrada vehicular',
      decididoPorEdge: true,
      deVisitante: true,
    },
  ],
  [`/api/ncr/copropiedades/${COP}/mi/notificaciones`]: [
    {
      id: 'n-1',
      tipo: 'visita_rechazada',
      en: '2026-09-29T14:10:00.000Z',
      visitante: 'Carla Ruiz',
      motivo: 'No coincide la foto',
      autorizacionId: AUTORIZACION_ID,
    },
    {
      id: 'n-2',
      tipo: 'ingreso_de_visitante',
      en: '2026-09-28T10:00:00.000Z',
      visitante: 'Pedro Gil',
      motivo: null,
      autorizacionId: null,
    },
  ],
  [`/api/ncr/copropiedades/${COP}/mi/perfil`]: {
    nombres: 'Ana',
    apellidos: 'Pérez',
    nombreCompleto: 'Ana Pérez',
    fechaNacimiento: '1990-05-17',
    tipoDocumento: 'cedula',
    numeroDocumento: '10203040',
    correo: 'ana@correo.invalid',
    telefono: '+573001112233',
    copropiedadNombre: 'Urbanización Mira',
    copropiedadDireccion: 'Kilómetro 4 vía La Calera',
    telefonoPorteria: '6011234567',
  },
  [`/api/ncr/copropiedades/${COP}/mi/ocupantes`]: {
    declarados: 2,
    declarada: true,
    aviso: '',
    plazas: [
      { id: 'p1', numero: 1, libre: false, codigo: null, ocupante: 'Ana Pérez' },
      { id: 'p2', numero: 2, libre: true, codigo: 'ABCD-EFGH', ocupante: null },
    ],
  },
};

export const respuesta = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

/** Un `fetch` que contesta por ruta exacta; las escrituras las decide `alEscribir`. */
export const servidorFalso = (
  alEscribir: (p: Request) => unknown = () => ({}),
  vacio = false,
): ReturnType<typeof vi.fn> =>
  vi.fn(async (entrada: string | Request) => {
    const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
    if (p.method !== 'GET') return respuesta(alEscribir(p));
    const cuerpo = RESPUESTAS[new URL(p.url).pathname];
    if (cuerpo === undefined) return respuesta({ estado: 404, mensaje: 'no' }, 404);
    if (vacio) return respuesta(Array.isArray(cuerpo) ? [] : cuerpo);
    return respuesta(cuerpo);
  });

export const conCodigo = (estado: number): ReturnType<typeof vi.fn> =>
  vi.fn(async () => respuesta({ estado, mensaje: 'no' }, estado));

export const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
  >
    {children}
  </QueryClientProvider>
);

/** Peticiones de ESCRITURA observadas, con su ruta sin el proxy y su cuerpo. */
export const escrituras = async (
  espia: ReturnType<typeof vi.fn>,
): Promise<readonly { metodo: string; ruta: string; cuerpo: unknown }[]> => {
  const salida: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
  for (const [entrada] of espia.mock.calls as readonly unknown[][]) {
    if (!(entrada instanceof Request) || entrada.method === 'GET') continue;
    const texto = await entrada.clone().text();
    salida.push({
      metodo: entrada.method,
      ruta: new URL(entrada.url).pathname.replace('/api/ncr', ''),
      cuerpo: texto === '' ? null : (JSON.parse(texto) as unknown),
    });
  }
  return salida;
};

/** El nombre que un lector de pantalla anunciaría para un control. */
export const nombreAccesible = (e: HTMLElement): string => {
  const etiquetado = e.getAttribute('aria-label')?.trim() ?? '';
  if (etiquetado !== '') return etiquetado;
  const porId = e.getAttribute('aria-labelledby');
  if (porId !== null) {
    const texto = porId
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (texto !== '') return texto;
  }
  if (e.id !== '') {
    const etiqueta = document.querySelector(`label[for="${e.id}"]`);
    if ((etiqueta?.textContent ?? '').trim() !== '') return (etiqueta?.textContent ?? '').trim();
  }
  const envolvente = e.closest('label');
  if ((envolvente?.textContent ?? '').trim() !== '') return (envolvente?.textContent ?? '').trim();
  return (e.textContent ?? '').trim();
};
