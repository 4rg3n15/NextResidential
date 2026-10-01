import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { NodoDeSalidas, SalidaAplanada } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { alcanzaCopropiedad } from '../../autenticacion';
import type { RepositorioDeEquipos } from './puertos';
import { ROLES_QUE_ADMINISTRAN_SALIDAS, nombreDePunto } from './puntos-de-acceso';
import type { PuntoDeAcceso, RepositorioDePuntos } from './puntos-de-acceso';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · DESCUBRIR, VER Y NOMBRAR LAS SALIDAS DE UN VIDEOPORTERO
 *
 * El árbol equipo → módulo → salida se LEE del equipo cada vez que el
 * administrador abre la ficha: lo que declara hoy, no lo que declaraba ayer.
 * «Descubrir» lo persiste en `puntos_de_acceso`; sólo entonces la guardia lo
 * ofrece. Nada de esto abre una puerta.
 *
 * Sólo el videoportero en esta ronda: la cámara, el relé y la terminal abren
 * la puerta de su ficha, como hasta ahora (R1). Ampliarlo es un caso de uso
 * nuevo, no una rama más aquí.
 * ═════════════════════════════════════════════════════════════════════════════
 */
/**
 * Lo que el puerto devuelve, ya traducido: el árbol y sus salidas abribles, o
 * por qué no hay lectura (en palabras del operador, sin ruta, dirección ni
 * credencial), o por qué lo leído no vale (R3: más hondo de 3 niveles). Nunca
 * lanza por el equipo: un equipo que no contesta es un desenlace, no un fallo
 * de la aplicación.
 */
export type LecturaDeSalidas =
  | {
      readonly estado: 'leida';
      readonly arbol: NodoDeSalidas;
      readonly salidas: readonly SalidaAplanada[];
    }
  | { readonly estado: 'sin_lectura'; readonly motivo: string }
  | { readonly estado: 'invalida'; readonly motivo: string };

export interface LectorDeSalidas {
  leer(dispositivoId: string): Promise<LecturaDeSalidas>;
}
export const LECTOR_DE_SALIDAS = Symbol.for('ncr.puerto.LectorDeSalidas');

export interface VistaDeSalidas {
  /** Lo que el equipo declara AHORA; `null` si no se pudo leer, con el motivo. */
  readonly arbol: NodoDeSalidas | null;
  readonly motivoSinArbol: string | null;
  /** Lo persistido: lo que la guardia ofrece. */
  readonly puntos: readonly PuntoDeAcceso[];
}

const prohibido = (detalle: string, regla?: string) =>
  fallo(errorDominio('OPERACION_NO_PERMITIDA', detalle, regla));

export class SalidasDelEquipo {
  constructor(
    private readonly equipos: Pick<RepositorioDeEquipos, 'listar'>,
    private readonly puntos: RepositorioDePuntos,
    private readonly lector: LectorDeSalidas,
    private readonly reloj: Reloj,
  ) {}

  /** El árbol que el equipo declara hoy y los puntos persistidos. */
  async consultar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<Resultado<VistaDeSalidas, ErrorDominio>> {
    const permitido = await this.exigirVideoportero(ctx, copropiedadId, dispositivoId);
    if (!permitido.ok) return permitido;
    const lectura = await this.lector.leer(dispositivoId);
    const puntos = await this.puntos.listar(ctx, copropiedadId, dispositivoId);
    return exito(
      lectura.estado === 'leida'
        ? { arbol: lectura.arbol, motivoSinArbol: null, puntos }
        : { arbol: null, motivoSinArbol: lectura.motivo, puntos },
    );
  }

  /** Lee el árbol y deja `puntos_de_acceso` igual a lo que el equipo declara. */
  async descubrir(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<Resultado<VistaDeSalidas, ErrorDominio>> {
    const permitido = await this.exigirVideoportero(ctx, copropiedadId, dispositivoId);
    if (!permitido.ok) return permitido;
    const lectura = await this.lector.leer(dispositivoId);
    if (lectura.estado === 'invalida') return fallo(errorDominio('DATO_INVALIDO', lectura.motivo));
    if (lectura.estado === 'sin_lectura') {
      // Sin lectura no se toca lo persistido: «no contestó» no es «no tiene
      // puertas». Se devuelve lo que había, con el motivo a la vista.
      const puntos = await this.puntos.listar(ctx, copropiedadId, dispositivoId);
      return exito({ arbol: null, motivoSinArbol: lectura.motivo, puntos });
    }
    const puntos = await this.puntos.sincronizar(
      ctx,
      copropiedadId,
      dispositivoId,
      lectura.salidas,
      this.reloj.ahora(),
    );
    return exito({ arbol: lectura.arbol, motivoSinArbol: null, puntos });
  }

  /** El nombre que verá la guardia junto al botón de abrir. */
  async renombrar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    puntoId: string,
    crudo: unknown,
  ): Promise<Resultado<PuntoDeAcceso, ErrorDominio>> {
    const permitido = this.exigirAdministracion(ctx, copropiedadId);
    if (!permitido.ok) return permitido;
    const nombre = nombreDePunto(crudo);
    if (nombre === null) {
      return fallo(errorDominio('DATO_INVALIDO', 'El nombre va de 1 a 80 caracteres visibles'));
    }
    const punto = await this.puntos.renombrar(ctx, copropiedadId, dispositivoId, puntoId, nombre);
    return punto === null
      ? fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Punto de acceso no encontrado'))
      : exito(punto);
  }

  private exigirAdministracion(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Resultado<true, ErrorDominio> {
    if (!ROLES_QUE_ADMINISTRAN_SALIDAS.includes(ctx.rol)) {
      return prohibido('Las salidas de un equipo las administra la administración');
    }
    // Segundo camino del aislamiento (§2.7.6): no se confía sólo en la ruta.
    if (!alcanzaCopropiedad(ctx, copropiedadId)) {
      return prohibido('La identidad no alcanza esta copropiedad', 'RN-15');
    }
    return exito(true);
  }

  private async exigirVideoportero(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<Resultado<true, ErrorDominio>> {
    const permitido = this.exigirAdministracion(ctx, copropiedadId);
    if (!permitido.ok) return permitido;
    const equipo = (await this.equipos.listar(ctx, copropiedadId)).find(
      (e) => e.id === dispositivoId,
    );
    if (equipo === undefined) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Equipo no encontrado'));
    }
    if (equipo.tipo !== 'intercom') {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          'Sólo el videoportero declara salidas; este equipo abre la puerta de su ficha',
        ),
      );
    }
    return exito(true);
  }
}
