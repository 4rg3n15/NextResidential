import type { diagnosticarEquipo, aplicarCorreccion } from '@ncr/providers';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import { copropiedadEnCurso } from '../../proveedores';
import type {
  CorrectorDeEquipo,
  DatosDeCorreccion,
  DatosDeSondeo,
  ResultadoDeCorreccionDeEquipo,
  ResultadoDeSondeo,
  SondaDeEquipo,
} from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · C2 · «PROBAR CONEXIÓN», EL DIAGNÓSTICO Y LAS CORRECCIONES, POR EL EDGE
 *
 * La sonda y el corrector no hablan con el equipo por el puerto: construyen su
 * propio cliente con el host y la clave. Desde Cloud Run no hay ruta a ese host
 * (ADR-035), así que en una copropiedad con puente el MISMO diagnóstico
 * (`diagnosticarEquipo`, `aplicarCorreccion` de providers) corre en el Edge, y
 * la traducción a la pantalla se queda aquí, idéntica. Sin puente, la sonda de
 * siempre (R1).
 *
 * La copropiedad sale de la petición en curso (`copropiedadEnCurso`); la clave,
 * si es `edge:<equipo>` (la que `credencialPara` devuelve con puente), la pone
 * el Edge de su registro cifrado: nunca vuelve a la nube.
 * ═════════════════════════════════════════════════════════════════════════════
 */
type Diagnosticar = typeof diagnosticarEquipo;
type Aplicar = typeof aplicarCorreccion;

/** Lo que no viaja por el túnel: funciones (la traza, el `fetch` del proceso). */
const sinFunciones = <T extends object>(opciones: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(opciones).filter(
      ([clave, valor]) => typeof valor !== 'function' && clave !== 'traza' && clave !== 'peticion',
    ),
  ) as Partial<T>;

export class SondaPorElEdge implements SondaDeEquipo {
  constructor(
    private readonly directa: SondaDeEquipo,
    private readonly conDiagnostico: (diagnosticar: Diagnosticar) => SondaDeEquipo,
    private readonly edge: CredencialesEnElEdge,
  ) {}

  async probar(datos: DatosDeSondeo): Promise<ResultadoDeSondeo> {
    const copropiedadId = copropiedadEnCurso();
    if (copropiedadId === undefined || (await this.edge.puenteDe(copropiedadId)) === null) {
      return this.directa.probar(datos);
    }
    const remoto: Diagnosticar = async (opciones) =>
      (await this.edge.pedir(
        copropiedadId,
        'equipo.diagnosticar',
        sinFunciones(opciones),
        60_000,
      )) as Awaited<ReturnType<Diagnosticar>>;
    return this.conDiagnostico(remoto).probar(datos);
  }
}

export class CorrectorPorElEdge implements CorrectorDeEquipo {
  constructor(
    private readonly directo: CorrectorDeEquipo,
    private readonly conAplicar: (aplicar: Aplicar) => CorrectorDeEquipo,
    private readonly edge: CredencialesEnElEdge,
  ) {}

  async corregir(datos: DatosDeCorreccion): Promise<ResultadoDeCorreccionDeEquipo> {
    const copropiedadId = copropiedadEnCurso();
    if (copropiedadId === undefined || (await this.edge.puenteDe(copropiedadId)) === null) {
      return this.directo.corregir(datos);
    }
    const remoto: Aplicar = async (opciones) =>
      (await this.edge.pedir(
        copropiedadId,
        'equipo.corregir',
        sinFunciones(opciones),
        60_000,
      )) as Awaited<ReturnType<Aplicar>>;
    return this.conAplicar(remoto).corregir(datos);
  }
}
