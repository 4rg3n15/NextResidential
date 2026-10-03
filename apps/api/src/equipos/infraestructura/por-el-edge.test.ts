import { describe, expect, it } from 'vitest';
import { from, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { aplicarCorreccion, diagnosticarEquipo } from '@ncr/providers';
import { CLAVE_EN_EL_EDGE } from '../../comun/credenciales-en-el-edge';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import { InterceptorDeCopropiedadEnCurso } from '../../proveedores';
import { SIN_PROBAR } from '../aplicacion/puertos';
import type {
  CorrectorDeEquipo,
  DatosDeCorreccion,
  DatosDeSondeo,
  SondaDeEquipo,
} from '../aplicacion/puertos';
import { CorrectorPorElEdge, SondaPorElEdge } from './por-el-edge';

/**
 * 15-Q2 · C2 · «Probar conexión» y las correcciones: con puente, el MISMO
 * diagnóstico corre en el Edge por el túnel, sin funciones, sin la traza y sin
 * la petición; sin puente (o fuera de una ruta de copropiedad), lo de siempre (R1).
 */
type Diagnosticar = typeof diagnosticarEquipo;
type Aplicar = typeof aplicarCorreccion;

const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = 'd0000001-0000-4000-8000-000000000001';

/** La copropiedad «en curso» la pone el interceptor, como en una petición real. */
const enCopropiedad = <T>(copropiedadId: string, hacer: () => Promise<T>): Promise<T> => {
  const contexto = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ url: `/copropiedades/${copropiedadId}/equipos` }),
    }),
  } as unknown as ExecutionContext;
  const siguiente: CallHandler = { handle: () => from(hacer()) };
  return lastValueFrom(
    new InterceptorDeCopropiedadEnCurso().intercept(contexto, siguiente),
  ) as Promise<T>;
};

const edgeFalso = (puente: string | null) => {
  const pedidos: { copropiedadId: string; nombre: string; carga: unknown; plazoMs: number }[] = [];
  const consultas: string[] = [];
  const edge: CredencialesEnElEdge = {
    puenteDe: async (copropiedadId) => {
      consultas.push(copropiedadId);
      return puente;
    },
    exigirTunel: () => undefined,
    entregar: async () => ({ autenticado: true, estado: 'en_linea' }),
    retirar: async () => undefined,
    pedir: async (copropiedadId, nombre, carga, plazoMs) => {
      pedidos.push({ copropiedadId, nombre, carga, plazoMs });
      return { desde: 'el Edge' };
    },
  };
  return { edge, pedidos, consultas };
};

/** Lo que el cliente de verdad pasaría: datos, y cosas que NO pueden cruzar. */
const opcionesConFunciones = (clave: string) => ({
  host: '192.0.2.30',
  puerto: 80,
  usuario: 'operador-de-prueba',
  clave,
  tiempoMs: 5_000,
  traza: [] as string[],
  peticion: { cuerpo: 'no viaja' },
  fetch: () => Promise.reject(new Error('no se usa')),
  alResponder: () => undefined,
});

const DATOS: DatosDeSondeo = {
  host: '192.0.2.30',
  puerto: 80,
  protocolo: 'http',
  usuario: 'operador-de-prueba',
  secreto: CLAVE_EN_EL_EDGE(EQUIPO),
  tipo: 'camara_lpr',
};

const montarSonda = (puente: string | null) => {
  const f = edgeFalso(puente);
  const fabricadas: Diagnosticar[] = [];
  const directa: SondaDeEquipo = { probar: async () => ({ ...SIN_PROBAR, detalle: 'directa' }) };
  const conDiagnostico = (diagnosticar: Diagnosticar): SondaDeEquipo => {
    fabricadas.push(diagnosticar);
    return {
      probar: async (datos) => {
        const opciones = opcionesConFunciones(datos.secreto);
        const r = await diagnosticar(opciones as unknown as Parameters<Diagnosticar>[0]);
        return { ...SIN_PROBAR, detalle: `remota: ${JSON.stringify(r)}` };
      },
    };
  };
  return { sonda: new SondaPorElEdge(directa, conDiagnostico, f.edge), fabricadas, ...f };
};

const CARGA_SIN_FUNCIONES = {
  host: '192.0.2.30',
  puerto: 80,
  usuario: 'operador-de-prueba',
  clave: CLAVE_EN_EL_EDGE(EQUIPO),
  tiempoMs: 5_000,
};

describe('SondaPorElEdge (15-Q2, C2)', () => {
  it('R1 · fuera de una ruta de copropiedad: la directa, sin preguntar por el puente', async () => {
    const m = montarSonda('edge-1');
    expect((await m.sonda.probar(DATOS)).detalle).toBe('directa');
    expect(m.consultas).toEqual([]);
    expect(m.fabricadas).toEqual([]);
  });

  it('R1 · copropiedad SIN puente: la directa, exactamente como antes', async () => {
    const m = montarSonda(null);
    const r = await enCopropiedad(COP, () => m.sonda.probar(DATOS));
    expect(r.detalle).toBe('directa');
    expect(m.consultas).toEqual([COP]);
    expect(m.pedidos).toEqual([]);
  });

  it('con puente: el diagnóstico va al Edge como `equipo.diagnosticar`, 60 s, sin funciones', async () => {
    const m = montarSonda('edge-1');
    const r = await enCopropiedad(COP, () => m.sonda.probar(DATOS));
    expect(r.detalle).toBe('remota: {"desde":"el Edge"}');
    expect(m.pedidos).toEqual([
      {
        copropiedadId: COP,
        nombre: 'equipo.diagnosticar',
        carga: CARGA_SIN_FUNCIONES,
        plazoMs: 60_000,
      },
    ]);
  });
});

describe('CorrectorPorElEdge (15-Q2, C2)', () => {
  const DATOS_C: DatosDeCorreccion = {
    host: '192.0.2.30',
    puerto: 80,
    protocolo: 'http',
    usuario: 'operador-de-prueba',
    secreto: CLAVE_EN_EL_EDGE(EQUIPO),
    correccion: 'modo_de_control',
    confirmadaPor: 'administrador de prueba',
  };
  const RESULTADO = {
    correccion: 'modo_de_control' as const,
    aplicada: false,
    valorAnterior: null,
    valorNuevo: null,
  };

  const montarCorrector = (puente: string | null) => {
    const f = edgeFalso(puente);
    const directo: CorrectorDeEquipo = {
      corregir: async () => ({ ...RESULTADO, detalle: 'directo' }),
    };
    const conAplicar = (aplicar: Aplicar): CorrectorDeEquipo => ({
      corregir: async (datos) => {
        const opciones = opcionesConFunciones(datos.secreto);
        const r = await aplicar(opciones as unknown as Parameters<Aplicar>[0]);
        return { ...RESULTADO, detalle: `remoto: ${JSON.stringify(r)}` };
      },
    });
    return { corrector: new CorrectorPorElEdge(directo, conAplicar, f.edge), ...f };
  };

  it('R1 · fuera de una ruta de copropiedad, o sin puente: el directo', async () => {
    const m = montarCorrector(null);
    expect((await m.corrector.corregir(DATOS_C)).detalle).toBe('directo');
    expect((await enCopropiedad(COP, () => m.corrector.corregir(DATOS_C))).detalle).toBe('directo');
    expect(m.consultas).toEqual([COP]);
    expect(m.pedidos).toEqual([]);
  });

  it('con puente: la corrección va al Edge como `equipo.corregir`, 60 s, sin funciones', async () => {
    const m = montarCorrector('edge-1');
    const r = await enCopropiedad(COP, () => m.corrector.corregir(DATOS_C));
    expect(r.detalle).toBe('remoto: {"desde":"el Edge"}');
    expect(m.pedidos).toEqual([
      {
        copropiedadId: COP,
        nombre: 'equipo.corregir',
        carga: CARGA_SIN_FUNCIONES,
        plazoMs: 60_000,
      },
    ]);
  });
});
