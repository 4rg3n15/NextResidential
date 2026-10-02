import type { Bitacora } from '@ncr/domain-core';
import { EdgeDesconectado, ProtocoloInvalido } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import type { CredencialesEnElEdge, EntregaAlEdge } from '../../comun/credenciales-en-el-edge';
import type { RutasDeEquipos, TunelesDeEdge } from '../../proveedores';
import type {
  Huella,
  LecturaParaElEdge,
  MarcaDeCredencial,
} from '../aplicacion/puertos-del-puente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · D1-D3 · LA CREDENCIAL DE CADA EQUIPO VIVE EN EL EDGE, NO EN LA NUBE
 *
 * La consola la escribe; la API la pasa por el túnel (pedido `credencial.guardar`)
 * sin guardarla, sin registrarla y sin devolverla. El Edge la cifra con su llave
 * (AES-256-GCM, `EDGE_EQUIPOS_LLAVE`) y contesta si, con ella, el equipo
 * autentica. En la base queda `edge:<gateway>` y una HUELLA (HMAC con una llave
 * que sólo la API tiene): dice si cambió, nunca cuál es.
 *
 * El registro que viaja es el del equipo SIN clave, tal como la base lo tiene
 * (host, puerto, tipo, canales, capacidades) y, si es una cámara, el secreto de
 * su Alarm Server: con puente, la cámara publica al Edge.
 * ═════════════════════════════════════════════════════════════════════════════
 */

const ESTADOS: readonly unknown[] = ['en_linea', 'fuera_de_linea', 'degradado'];

/**
 * Lo que contesta el Edge, con FORMA ESTRICTA: de ese `autenticado` depende que
 * la nube borre su copia (D3). Un `"false"`, un `1` o una respuesta vacía no son
 * «sí»: son un Edge que no habla el protocolo, y no se marca ni se borra nada.
 */
export const leerEntrega = (r: unknown): EntregaAlEdge => {
  const { autenticado, estado } = (typeof r === 'object' && r !== null ? r : {}) as Record<
    string,
    unknown
  >;
  if (typeof autenticado !== 'boolean' || !ESTADOS.includes(estado)) {
    throw new ProtocoloInvalido('el Edge contestó la entrega sin la forma del protocolo');
  }
  return { autenticado, estado: estado as EntregaAlEdge['estado'] };
};

/** El pedido al Edge, compartido con la migración (D3). */
export const pedirGuardar = async (
  tuneles: TunelesDeEdge,
  copropiedadId: string,
  equipo: Record<string, unknown>,
): Promise<EntregaAlEdge> => {
  const sesion = tuneles.sesionDe(copropiedadId);
  if (sesion === null) throw new EdgeDesconectado();
  return leerEntrega(await sesion.pedir('credencial.guardar', { equipo }, { plazoMs: 15_000 }));
};

export class CredencialesDelPuente implements CredencialesEnElEdge {
  constructor(
    private readonly rutas: RutasDeEquipos,
    private readonly tuneles: TunelesDeEdge,
    private readonly lectura: LecturaParaElEdge,
    private readonly marca: MarcaDeCredencial,
    private readonly huella: Huella,
    private readonly bitacora: Bitacora,
  ) {}

  puenteDe(copropiedadId: string): Promise<string | null> {
    return this.rutas.edgeDe(copropiedadId);
  }

  exigirTunel(copropiedadId: string): void {
    if (this.tuneles.sesionDe(copropiedadId) === null) throw new EdgeDesconectado();
  }

  async entregar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    clave: string | null,
  ): Promise<EntregaAlEdge> {
    const edgeId = await this.rutas.edgeDe(copropiedadId);
    const equipo = await this.lectura.sinClave(dispositivoId);
    if (edgeId === null || equipo === null)
      throw new EdgeDesconectado('el equipo no va por un Edge');
    const secreto = await this.lectura.secretoDeCamara(ctx, copropiedadId, dispositivoId);
    const r = await pedirGuardar(this.tuneles, copropiedadId, {
      ...equipo,
      ...(clave === null ? {} : { clave }),
      ...(secreto === null ? {} : { secretoAlarmServer: secreto }),
    });
    await this.marca.enElEdge(
      copropiedadId,
      dispositivoId,
      edgeId,
      clave === null ? null : this.huella(copropiedadId, dispositivoId, clave),
    );
    this.rutas.olvidar(dispositivoId);
    this.bitacora.registrar('info', 'equipo entregado al Edge', {
      dispositivoId,
      conClave: clave !== null,
      autenticado: r.autenticado,
    });
    return r;
  }

  pedir(copropiedadId: string, nombre: string, carga: unknown, plazoMs: number) {
    const sesion = this.tuneles.sesionDe(copropiedadId);
    if (sesion === null) return Promise.reject(new EdgeDesconectado());
    return sesion.pedir(nombre, carga, { plazoMs });
  }

  async retirar(copropiedadId: string, dispositivoId: string): Promise<void> {
    try {
      const sesion = this.tuneles.sesionDe(copropiedadId);
      if (sesion === null) throw new EdgeDesconectado();
      await sesion.pedir('credencial.retirar', { dispositivoId }, { plazoMs: 10_000 });
    } catch (error) {
      // La baja en la nube ya ocurrió: al reconectar, el Edge recibe el
      // inventario vigente (`equipos.vigentes`) y retira lo que no esté.
      this.bitacora.registrar('aviso', 'el Edge no pudo retirar el equipo dado de baja', {
        dispositivoId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
