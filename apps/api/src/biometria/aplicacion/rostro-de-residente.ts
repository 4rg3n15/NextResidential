import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type {
  ErrorDominio,
  MedidasDeCaptura,
  MotivoRechazoCaptura,
  Reloj,
  Resultado,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RevocarConsentimiento } from './casos-de-uso';
import type { PreparacionDeCaptura } from './preparacion-de-captura';
import type {
  BovedaDePlantillas,
  CatalogoDeTerminales,
  RepositorioConsentimientos,
} from './puertos';
import type {
  EstadoEnEquipo,
  LecturaDeRostros,
  PlantillaViva,
  ReemplazoDeRostro,
} from './puertos-del-rostro';
import type { SincronizarPlantillaEnTerminales } from './sincronizacion-total';
import type { SuprimirYRetirarYa } from './suprimir-y-retirar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · EL ROSTRO DE UN RESIDENTE (D2; D3 lo amplía al menor) · ADR-039
 *
 * Lo que la biometría hace con el rostro de quien VIVE en el conjunto, sin
 * autorización de visita que lo respalde. El módulo del residente pone la
 * puerta —quién es la persona, la política, la foto, el tope de 24 h—; aquí
 * se hace lo que toca plantillas, consentimientos, bóveda y equipos:
 *
 *   registrar · la MISMA preparación que la captura de una visita (calidad →
 *     consentimiento otorgado por el titular → plantilla) → consentimiento,
 *     plantilla y reemplazo de su rostro anterior en UNA transacción (o
 *     `en_conflicto` si otro registro ganó) → cifrado → el anterior fuera de
 *     los equipos YA → envío a todos los equipos con rostros (un equipo que no
 *     responde no deshace nada).
 *   retirar · revocar su consentimiento vigente (suprime y retira de los
 *     equipos todo lo de ese consentimiento, CA-11) y suprimir YA lo que
 *     quedara vivo con otro.
 *
 *   D3 · el MENOR de 15 a 17 años: lo mismo, con la cuenta del titular del
 *   hogar como representante legal (`representanteId`): autoriza al registrar
 *   y revoca al retirar. Quién puede serlo lo decide el módulo del residente.
 *   La revocación del representante va por `RevocarConsentimiento`, para que
 *   también ella suprima ANTES de revocar (lo exige la base) y retire de los
 *   equipos en el acto.
 *   leer · lo que se pinta, sin la imagen.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface EntradaDeRostroDeResidente {
  readonly titularId: string;
  readonly vector: Uint8Array;
  readonly medidas: MedidasDeCaptura;
  readonly versionPolitica: string;
  readonly suprimirEn: Date;
  /**
   * D3 · el rostro de un MENOR: lo autoriza la cuenta del titular del hogar
   * como su representante legal. Sin él, lo otorga el propio titular (D2).
   */
  readonly representanteId?: string;
}

export type ResultadoDeRostroDeResidente =
  | { readonly registrado: true; readonly plantillaId: string; readonly reemplazada: string | null }
  | { readonly registrado: false; readonly motivos: readonly MotivoRechazoCaptura[] }
  | { readonly registrado: false; readonly enConflicto: true };

export interface RostroLeidoDeResidente {
  readonly plantilla: PlantillaViva | null;
  readonly equipos: readonly { readonly nombre: string; readonly estado: EstadoEnEquipo }[];
  readonly retiradasPendientes: number;
}

export interface DependenciasDelRostroDeResidente {
  readonly preparacion: Pick<PreparacionDeCaptura, 'preparar'>;
  readonly consentimientos: Pick<RepositorioConsentimientos, 'vigenteDe'>;
  readonly reemplazo: ReemplazoDeRostro;
  readonly boveda: BovedaDePlantillas;
  readonly lectura: LecturaDeRostros;
  readonly catalogo: CatalogoDeTerminales;
  readonly enTerminales: Pick<SincronizarPlantillaEnTerminales, 'ejecutar'>;
  readonly revocar: Pick<RevocarConsentimiento, 'ejecutar'>;
  readonly suprimirYa: Pick<SuprimirYRetirarYa, 'plantillas'>;
  readonly reloj: Reloj;
}

const sinCopropiedad = (): ErrorDominio =>
  errorDominio('ENTIDAD_NO_ENCONTRADA', 'La copropiedad no existe', 'RN-15');

export class RostroDeResidente {
  constructor(private readonly d: DependenciasDelRostroDeResidente) {}

  async registrar(
    ctx: ContextoTenant,
    entrada: EntradaDeRostroDeResidente,
  ): Promise<Resultado<ResultadoDeRostroDeResidente, ErrorDominio>> {
    const cop = ctx.copropiedadId;
    if (cop === null) return fallo(sinCopropiedad());
    const ahora = this.d.reloj.ahora();
    const anterior = await this.d.lectura.vivaDe(cop, entrada.titularId);
    const preparada = await this.d.preparacion.preparar(cop, {
      titularId: entrada.titularId,
      medidas: entrada.medidas,
      vector: entrada.vector,
      versionPolitica: entrada.versionPolitica,
      canal: 'app',
      suprimirEn: entrada.suprimirEn,
      ...(entrada.representanteId === undefined
        ? { otorgadoPorElTitular: true as const }
        : { representante: { representanteId: entrada.representanteId } }),
    });
    if (esFallo(preparada)) return preparada;
    if (!preparada.valor.aceptada) {
      return exito({ registrado: false, motivos: preparada.valor.motivos });
    }
    const { consentimiento, plantilla } = preparada.valor;
    // El consentimiento entra con la plantilla, en la misma transacción: si otro
    // registro gana, no queda un consentimiento vigente sin rostro.
    const r = await this.d.reemplazo.reemplazar({
      consentimiento,
      nueva: plantilla,
      anteriorLeida: anterior?.plantillaId ?? null,
      actorId: ctx.usuarioId,
      ahora,
    });
    if (!r.ok) return exito({ registrado: false, enConflicto: true });
    // El vector se cifra al entrar y no vuelve a salir hacia la aplicación.
    await this.d.boveda.guardar(cop, plantilla.id, entrada.vector);
    if (r.reemplazada !== null) await this.d.suprimirYa.plantillas(ctx, cop, [r.reemplazada]);
    await this.d.enTerminales.ejecutar(ctx, { plantillaId: plantilla.id });
    return exito({ registrado: true, plantillaId: plantilla.id, reemplazada: r.reemplazada });
  }

  /**
   * `false` si no había nada que retirar. Quien revoca es el titular (RN-10);
   * con `representanteId` (D3), el representante legal del menor, y sólo la
   * autorización de un representante: otro consentimiento vigente del menor
   * —de una visita, o suyo— no es suyo, y su rostro de residente se suprime
   * igual.
   */
  async retirar(
    ctx: ContextoTenant,
    titularId: string,
    representanteId?: string,
  ): Promise<Resultado<boolean, ErrorDominio>> {
    const cop = ctx.copropiedadId;
    if (cop === null) return fallo(sinCopropiedad());
    const vigente = await this.d.consentimientos.vigenteDe(cop, titularId);
    const viva = await this.d.lectura.vivaDe(cop, titularId);
    const revocable =
      vigente !== null &&
      (representanteId === undefined || vigente.origen === 'autorizado_por_representante_legal');
    if (!revocable && viva === null) return exito(false);
    if (revocable) {
      const revocado = await this.d.revocar.ejecutar(ctx, {
        consentimientoId: vigente.id,
        ...(representanteId === undefined
          ? { quienRevoca: titularId }
          : { quienRevoca: representanteId, comoRepresentanteLegal: true as const }),
      });
      if (esFallo(revocado)) return revocado;
    }
    if (viva !== null) await this.d.suprimirYa.plantillas(ctx, cop, [viva.plantillaId]);
    return exito(true);
  }

  async leer(ctx: ContextoTenant, titularId: string): Promise<RostroLeidoDeResidente> {
    const cop = ctx.copropiedadId ?? '';
    const [plantilla, retiradasPendientes, terminales] = await Promise.all([
      this.d.lectura.vivaDe(cop, titularId),
      this.d.lectura.retiradasPendientes(cop, titularId),
      this.d.catalogo.conBibliotecaDeRostros(ctx, cop),
    ]);
    const enEquipos =
      plantilla === null ? [] : await this.d.lectura.enEquipos(cop, plantilla.plantillaId);
    const porEquipo = new Map(enEquipos.map((e) => [e.dispositivoId, e.estado]));
    return {
      plantilla,
      equipos: terminales.map((t) => ({
        nombre: t.nombre,
        estado: porEquipo.get(t.dispositivoId) ?? 'pendiente',
      })),
      retiradasPendientes,
    };
  }

  /** El tope de 24 h se cuenta en la base: cuándo capturó esta cuenta. */
  capturasRecientes(cop: string, usuarioId: string, ahora: Date): Promise<readonly Date[]> {
    return this.d.lectura.capturasRecientes(cop, usuarioId, ahora);
  }
}
