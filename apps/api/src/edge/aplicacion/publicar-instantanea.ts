import type { Bitacora, Reloj } from '@ncr/domain-core';
import { contenidoDe, hashDe } from './instantanea';
import type { InstantaneaParaElEdge } from './instantanea';
import type {
  FuenteDeReglas,
  GatewayRegistrado,
  PublicadorDeVersiones,
  RepositorioDeGateways,
} from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Q1 · LA INSTANTÁNEA, VERSIONADA E INCREMENTAL (`?desde=`)
 *
 * El Edge pregunta «tengo la versión N; ¿hay otra?». La respuesta:
 *
 *  · `nueva`      → la instantánea completa, con una versión MAYOR que N;
 *  · `sin_cambios`→ la versión vigente es N (o menor) y el contenido no cambió.
 *                   Viaja con `generadaEn` de AHORA: la nube acaba de dar fe de
 *                   que esas reglas siguen siendo las vigentes, y el Edge mide
 *                   la obsolescencia de KPI-31 desde ahí, no desde que las bajó.
 *  · `adelantada` → el Edge dice tener una versión que la nube NUNCA publicó.
 *                   Sólo pasa si la base volvió atrás (un respaldo restaurado):
 *                   el Edge no aceptaría una versión menor y seguiría decidiendo
 *                   con reglas que ya no existen. Se dice, no se disimula.
 *
 * [SUPUESTO] S-181 · «incremental» es CONDICIONAL por versión, no un delta por
 * colección. Una instantánea cerrada es lo que garantiza RN-16 (ETAPA-12
 * §2.2): un Edge que aplica deltas tiene un estado que ninguna versión
 * publicada describe, y el hash dejaría de poder verificarlo.
 *
 * La versión se PUBLICA aquí, de forma perezosa: sólo si el hash del contenido
 * difiere del de la última publicada. Así la versión avanza cuando las reglas
 * cambian y nunca por el mero paso del tiempo entre dos descargas iguales.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export type ResultadoDeInstantanea =
  | { readonly tipo: 'nueva'; readonly instantanea: InstantaneaParaElEdge }
  | {
      readonly tipo: 'sin_cambios';
      readonly copropiedadId: string;
      readonly version: number;
      readonly generadaEn: string;
    }
  | { readonly tipo: 'adelantada'; readonly version: number; readonly desde: number };

/** Publicaciones concurrentes que pierden la carrera antes de rendirse. */
const INTENTOS_DE_PUBLICACION = 3;

export class PublicarInstantanea {
  constructor(
    private readonly fuente: FuenteDeReglas,
    private readonly versiones: PublicadorDeVersiones,
    private readonly gateways: RepositorioDeGateways,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(gateway: GatewayRegistrado, desde: number): Promise<ResultadoDeInstantanea> {
    const ahora = this.reloj.ahora();
    const copropiedadId = gateway.copropiedadId;
    const contenido = contenidoDe(
      copropiedadId,
      await this.fuente.leer(copropiedadId, ahora),
      ahora,
    );
    const hash = hashDe(contenido);
    const version = await this.versionPara(gateway, hash);
    await this.anotar(gateway, version, ahora);

    if (desde > version) {
      this.bitacora.registrar(
        'error',
        'un Edge tiene una versión de reglas que la nube no publicó',
        {
          copropiedadId,
          edgeId: gateway.id,
          versionDelEdge: desde,
          versionDeLaNube: version,
          remedio: 'reinicie la caché del Edge (DESPLIEGUE_EDGE.md §4.4): la base volvió atrás',
        },
      );
      return { tipo: 'adelantada', version, desde };
    }
    if (version <= desde) {
      return { tipo: 'sin_cambios', copropiedadId, version, generadaEn: ahora.toISOString() };
    }
    return {
      tipo: 'nueva',
      instantanea: { copropiedadId, version, hash, generadaEn: ahora.toISOString(), ...contenido },
    };
  }

  private async versionPara(gateway: GatewayRegistrado, hash: string): Promise<number> {
    for (let intento = 0; intento < INTENTOS_DE_PUBLICACION; intento += 1) {
      const ultima = await this.versiones.ultima(gateway.copropiedadId);
      if (ultima !== null && ultima.hash === hash) return ultima.numero;
      const numero = (ultima?.numero ?? 0) + 1;
      const publicada = await this.versiones.publicar(
        gateway.copropiedadId,
        { numero, hash },
        gateway.usuarioServicioId,
      );
      if (publicada) return numero;
    }
    throw new Error(
      `no se pudo publicar la versión de reglas: ${String(INTENTOS_DE_PUBLICACION)} ` +
        'publicaciones concurrentes ganaron la carrera',
    );
  }

  /** La anotación es observabilidad: si falla, la instantánea sale igual. */
  private async anotar(gateway: GatewayRegistrado, version: number, ahora: Date): Promise<void> {
    try {
      await this.gateways.anotarDescarga(gateway, version, ahora);
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo anotar la descarga del Edge', {
        edgeId: gateway.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
