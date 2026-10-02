import type { Bitacora } from '@ncr/domain-core';
import type { EquipoRegistrado } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import type { RutasDeEquipos } from '../../proveedores';
import type { EntregarAlEdge, Huella, LecturaParaElEdge } from './puertos-del-puente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · D3 · LAS CREDENCIALES QUE YA ESTABAN EN LA NUBE SE MUDAN AL EDGE
 *
 * Una por una, y en este orden, que es el que no pierde ninguna:
 *
 *  1. La API la lee de su bóveda (`credenciales_de_equipo`) y se la entrega al
 *     Edge con el resto del equipo.
 *  2. El Edge la guarda cifrada y CONFIRMA que el equipo autentica con ella.
 *  3. SÓLO entonces la API la borra: la fila queda (no hay borrado físico,
 *     RN-19) pero sin iv, cuerpo ni etiqueta —lo exige un CHECK (0050)—, y el
 *     equipo pasa a `edge:<gateway>` con su huella.
 *
 * Si el Edge no autentica (equipo apagado, clave ya cambiada en el aparato),
 * la credencial SE QUEDA en la nube y se dice por qué: no se borra lo que nadie
 * ha demostrado que funciona en otro sitio. Se puede volver a ejecutar: sólo
 * mueve las que siguen en la nube.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CredencialesEnLaNube {
  /** Los equipos activos de la copropiedad con una credencial ACTIVA en la nube. */
  pendientes(copropiedadId: string): Promise<readonly string[]>;
  /** El equipo con su clave, descifrada de la bóveda. */
  completa(dispositivoId: string): Promise<EquipoRegistrado | null>;
  /** Borra los bytes, deja la referencia `edge:` y la huella. Una transacción. */
  trasladar(copropiedadId: string, id: string, edgeId: string, huella: string): Promise<void>;
}

export interface ResultadoDeTraslado {
  readonly dispositivoId: string;
  readonly trasladada: boolean;
  readonly motivo: string;
}

export class MigrarCredencialesAlEdge {
  constructor(
    private readonly rutas: RutasDeEquipos,
    private readonly entregar: EntregarAlEdge,
    private readonly lectura: LecturaParaElEdge,
    private readonly nube: CredencialesEnLaNube,
    private readonly huella: Huella,
    /** Lo que el proceso recuerda de esas credenciales (el registro en caché) se suelta. */
    private readonly olvidar: (dispositivoId: string) => void,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(ctx: ContextoTenant, copropiedadId: string): Promise<ResultadoDeTraslado[]> {
    const edgeId = await this.rutas.edgeDe(copropiedadId);
    if (edgeId === null) return [];
    const resultados: ResultadoDeTraslado[] = [];
    for (const id of await this.nube.pendientes(copropiedadId)) {
      resultados.push(await this.una(ctx, copropiedadId, edgeId, id));
    }
    this.bitacora.registrar('info', 'migración de credenciales al Edge', {
      copropiedadId,
      trasladadas: resultados.filter((r) => r.trasladada).length,
      pendientes: resultados.filter((r) => !r.trasladada).length,
    });
    return resultados;
  }

  private async una(
    ctx: ContextoTenant,
    copropiedadId: string,
    edgeId: string,
    dispositivoId: string,
  ): Promise<ResultadoDeTraslado> {
    const equipo = await this.nube.completa(dispositivoId);
    if (equipo === null) {
      return { dispositivoId, trasladada: false, motivo: 'el equipo no tiene credencial completa' };
    }
    const secreto = await this.lectura.secretoDeCamara(ctx, copropiedadId, dispositivoId);
    try {
      const r = await this.entregar(copropiedadId, {
        ...equipo,
        ...(secreto === null ? {} : { secretoAlarmServer: secreto }),
      });
      if (r.autenticado !== true) {
        return {
          dispositivoId,
          trasladada: false,
          motivo: `el Edge no pudo autenticarse con ella (${r.estado}): sigue en la nube`,
        };
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      return { dispositivoId, trasladada: false, motivo: `sin entregar al Edge: ${motivo}` };
    }
    await this.nube.trasladar(
      copropiedadId,
      dispositivoId,
      edgeId,
      this.huella(copropiedadId, dispositivoId, equipo.clave),
    );
    this.olvidar(dispositivoId);
    this.rutas.olvidar(dispositivoId);
    return { dispositivoId, trasladada: true, motivo: 'en el Edge; borrada de la nube' };
  }
}
