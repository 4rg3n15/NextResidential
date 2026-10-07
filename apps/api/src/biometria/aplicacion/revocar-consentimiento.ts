import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type {
  BovedaDePlantillas,
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from './puertos';

const noEncontrado = (que: string): ErrorDominio =>
  errorDominio('ENTIDAD_NO_ENCONTRADA', `${que} no existe en esta copropiedad`, 'RN-15');

/**
 * `RevocarConsentimiento` — RN-11, CA-11.
 *
 * Suprime **antes** de guardar la revocación, y el orden importa: si se
 * guardara primero y el borrado fallara, quedaría un consentimiento revocado
 * con el dato todavía en la base. Al revés, un fallo deja el consentimiento
 * vigente y el dato borrado — que es el error que se puede vivir.
 *
 * A3 (15-E) · **y retira de las terminales en el acto**. CA-11 dice «de
 * inmediato», y hasta aquí «inmediato» era el vector en la base: la retirada
 * del equipo esperaba al barrido. Ahora se intenta aquí mismo, terminal por
 * terminal; la que no responda queda en la cola derivada de CA-10 y el
 * barrido la reintenta. Se devuelven las dos cuentas por separado, porque
 * «suprimida en base» y «retirada del equipo» son hechos distintos y la hoja
 * de resultados en sitio los coteja por separado.
 */
export interface EntradaDeRevocacion {
  readonly consentimientoId: string;
  /** El titular (su persona); con `comoRepresentanteLegal`, la cuenta del representante. */
  readonly quienRevoca: string;
  /**
   * 15-X · D3 · un representante legal retira la autorización que dio un
   * representante (el rostro de un menor). Sin la marca, sólo el titular.
   */
  readonly comoRepresentanteLegal?: true;
}

export interface ResultadoDeRevocacion {
  readonly plantillasSuprimidas: number;
  /** Retiradas de terminal confirmadas por el proveedor en esta llamada. */
  readonly retiradas: number;
  /** Terminales que no respondieron: siguen en la cola de CA-10. */
  readonly retiradasPendientes: number;
}

export class RevocarConsentimiento {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaDeRevocacion,
  ): Promise<Resultado<ResultadoDeRevocacion, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const actual = await this.consentimientos.porId(copropiedadId, entrada.consentimientoId);
    if (actual === null) return fallo(noEncontrado('El consentimiento'));

    const ahora = this.reloj.ahora();
    const revocado =
      entrada.comoRepresentanteLegal === true
        ? actual.revocarComoRepresentanteLegal(entrada.quienRevoca, ahora)
        : actual.revocar(entrada.quienRevoca, ahora);
    if (esFallo(revocado)) return revocado;

    const afectadas = await this.plantillas.deConsentimiento(copropiedadId, actual.id);
    const suprimidasAhora = new Set<string>();
    for (const p of afectadas) {
      if (p.suprimida) continue;
      await this.boveda.olvidar(copropiedadId, p.id);
      await this.plantillas.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
      await this.plantillas.guardar(p.suprimirPorRevocacion(ahora), ctx.usuarioId);
      suprimidasAhora.add(p.id);
    }

    await this.consentimientos.guardar(revocado.valor, ctx.usuarioId);

    // La retirada inmediata: sólo de las plantillas de ESTE consentimiento.
    let retiradas = 0;
    let retiradasPendientes = 0;
    const propias = new Set(afectadas.map((p) => p.id));
    for (const destino of await this.plantillas.porRetirar(copropiedadId)) {
      if (!propias.has(destino.plantillaId)) continue;
      try {
        await this.boveda.retirarDeTerminal(destino.plantillaId, destino.dispositivoId);
        await this.plantillas.registrarRetirada(destino, ctx.usuarioId);
        retiradas += 1;
      } catch {
        // La terminal no respondió: la fila sigue en la cola y el barrido
        // lo reintenta. No se marca retirada lo que no se retiró.
        retiradasPendientes += 1;
      }
    }

    return exito({ plantillasSuprimidas: suprimidasAhora.size, retiradas, retiradasPendientes });
  }
}
