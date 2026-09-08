import { VersionDeReglas, esFallo } from '@ncr/domain-core';
import type { Bitacora, ContextoDeAcceso } from '@ncr/domain-core';
import type {
  CargadorDeContexto,
  RepositorioVersionDeReglas,
  ResolutorDeZona,
  SolicitudDeAcceso,
} from '../aplicacion/puertos';

/** [SUPUESTO] S-16 · P-02 sigue abierta; el umbral vigente es 0,85. */
export const UMBRAL_DE_CONFIANZA_POR_DEFECTO = 0.85;

/**
 * Cargador de contexto **conservador y provisional** — D-25, §2.1.4.
 *
 * Este entorno no tiene contraseña de PostgreSQL, así que no hay de dónde leer
 * autorizaciones, listas negras ni zonas. La pregunta no es si eso se puede
 * disimular, sino qué debe hacer el sistema cuando no puede saber: **denegar**.
 *
 * Devuelve un contexto sin nada resuelto, y el motor —sin tocarlo— produce
 * `FALLO_TECNICO` por `politicaVivienda`. Esa negación no es un fallo de la
 * etapa: es el comportamiento que §2.1.4 exige, y además es **visible**, porque
 * la política de alertas la clasifica como acceso dudoso y la escala a un
 * humano (P-07). Un cargador que devolviera un permiso «para que la demo
 * funcione» habría hecho lo contrario: abrir la puerta sin saber a quién.
 *
 * Se puede sembrar (`sembrar`) para que las pruebas ejerciten los caminos
 * permitido y negado sin base de datos. Cuando llegue el adaptador PostgreSQL
 * de autorizaciones, sustituye a este **sin tocar el puerto**.
 */
export class CargadorDeContextoConservador implements CargadorDeContexto {
  private readonly sembrados = new Map<string, ContextoDeAcceso>();

  constructor(
    private readonly versiones: RepositorioVersionDeReglas,
    private readonly bitacora?: Bitacora,
    /**
     * ETAPA 07 · CU-05. Cuando la solicitud nombra una zona, es este puerto
     * quien dice si abre y si está llena. El motor la recibe ya resuelta y no
     * consulta nada: es lo que lo mantiene puro.
     */
    private readonly zonas?: ResolutorDeZona,
  ) {}

  /** Clave: `copropiedadId|dispositivoId`. Solo para pruebas y demostración. */
  sembrar(copropiedadId: string, dispositivoId: string, contexto: ContextoDeAcceso): void {
    this.sembrados.set(`${copropiedadId}|${dispositivoId}`, contexto);
  }

  async cargar(solicitud: SolicitudDeAcceso, ahora: Date): Promise<ContextoDeAcceso> {
    const sembrado = this.sembrados.get(`${solicitud.copropiedadId}|${solicitud.dispositivoId}`);
    if (sembrado !== undefined)
      return { ...sembrado, ahora, zona: await this.zona(solicitud, ahora) };

    this.bitacora?.registrar('aviso', 'contexto de acceso sin origen de datos: se denegará', {
      copropiedadId: solicitud.copropiedadId,
      dispositivoId: solicitud.dispositivoId,
      motivo: 'D-25 · sin adaptador de persistencia de autorizaciones',
    });

    return {
      ahora,
      copropiedadId: solicitud.copropiedadId,
      versionDeReglas: await this.versiones.vigenteDe(solicitud.copropiedadId),
      personaId: solicitud.personaId,
      viviendaId: null,
      metodo: solicitud.metodo,
      autorizaciones: [],
      personasEnListaNegra: new Set<string>(),
      placasEnListaNegra: new Set<string>(),
      placaLeida: solicitud.placaLeida,
      placaConocida: false,
      viviendaActiva: false,
      zona: await this.zona(solicitud, ahora),
      confianza: solicitud.confianza,
      umbralDeConfianza: UMBRAL_DE_CONFIANZA_POR_DEFECTO,
      consentimientoVigente: false,
    };
  }

  /** `null` cuando la solicitud no nombra zona, o cuando no hay quien resuelva. */
  private async zona(solicitud: SolicitudDeAcceso, ahora: Date): Promise<ContextoDeAcceso['zona']> {
    if (solicitud.zonaId === null || this.zonas === undefined) return null;
    return this.zonas.resolver(solicitud.copropiedadId, solicitud.zonaId, ahora);
  }
}

/**
 * Versión de reglas provisional: v1 para toda copropiedad. La versión real vive
 * en `versiones_de_reglas` (migración 0010) y es monótona por copropiedad; sin
 * base, sellar v1 es honesto —todas las decisiones de este despliegue se
 * tomaron con el mismo conjunto— y no inventa un historial que no existe.
 */
export class VersionDeReglasFija implements RepositorioVersionDeReglas {
  async vigenteDe(copropiedadId: string): Promise<VersionDeReglas> {
    const version = VersionDeReglas.crear(1, copropiedadId);
    if (esFallo(version)) {
      throw new Error(`copropiedad inválida al sellar la versión: ${version.error.detalle}`);
    }
    return version.valor;
  }
}
